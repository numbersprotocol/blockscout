import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { once } from "node:events";
import { setTimeout } from "node:timers/promises";

async function startProxy(t, mode = "ok") {
  const dir = mkdtempSync(join(tmpdir(), "supply-http-"));
  const stateFile = join(dir, "state.json");
  const callsFile = join(dir, "calls.txt");
  const initial = {
    now: 100000,
    mode,
    rows: [["date", "1/1/2020"], ["total_supply", "100"], ["circulating_supply", "90"]],
  };
  const state = (updates = {}) => writeFileSync(stateFile, JSON.stringify({ ...initial, ...updates }));
  state();
  writeFileSync(callsFile, "");
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const child = spawn(process.execPath, ["--import", new URL("./fixtures/mock-sheet.js", import.meta.url).href,
    new URL("../server.js", import.meta.url).pathname], {
    env: { ...process.env, NODE_ENV: "development", PORT: String(port), SHEET_ID: "test-sheet",
      SHEET_RANGE: "supply!A2:4", CACHE_TTL_MS: "1000", STALE_MAX_MS: "5000",
      MOCK_SHEET_STATE: stateFile, MOCK_SHEET_CALLS: callsFile },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (data) => { logs += data; });
  child.stderr.on("data", (data) => { logs += data; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
    rmSync(dir, { recursive: true, force: true });
  });
  const get = (path) => fetch(`http://127.0.0.1:${port}${path}`);
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) assert.fail(logs);
    try {
      if ((await get("/healthz")).ok) return {
        get, state, calls: () => readFileSync(callsFile, "utf8").trim().split("\n").filter(Boolean).length,
      };
    } catch { /* 等待子程序開始監聽。 */ }
    await setTimeout(25);
  }
  assert.fail(`proxy 未能啟動：${logs}`);
}

test("HTTP 健康、404、供應量格式與快取命中", async (t) => {
  const proxy = await startProxy(t);
  assert.deepEqual(await (await proxy.get("/healthz")).json(), { ok: true });
  assert.equal((await proxy.get("/missing")).status, 404);
  const response = await proxy.get("/supply");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, max-age=300");
  assert.equal(response.headers.get("x-supply-as-of"), "2020-01-01");
  assert.equal(response.headers.get("x-powered-by"), null);
  assert.deepEqual(await response.json(), { total_supply: 100, circulating_supply: 90 });
  for (const [result, amount] of [["total_supply_text", "100"], ["circulating_supply_text", "90"]]) {
    const text = await proxy.get(`/supply/?result=${result}`);
    assert.match(text.headers.get("content-type"), /^text\/plain/);
    assert.equal(await text.text(), amount);
  }
  assert.equal(proxy.calls(), 1);
});

test("Sheets 失敗時使用有效舊快取；過期後回 503，恢復後重新取值", async (t) => {
  const proxy = await startProxy(t);
  await (await proxy.get("/supply")).json();
  proxy.state({ now: 101001, mode: "upstream-error" });
  const stale = await proxy.get("/supply");
  assert.equal(stale.status, 200);
  assert.deepEqual(await stale.json(), { total_supply: 100, circulating_supply: 90 });
  proxy.state({ now: 105001, mode: "upstream-error" });
  const expired = await proxy.get("/supply");
  assert.equal(expired.status, 503);
  assert.equal(expired.headers.get("cache-control"), "no-store");
  assert.deepEqual(await expired.json(), { error: "supply data temporarily unavailable" });
  proxy.state({ now: 105002 });
  assert.equal((await proxy.get("/supply")).status, 200);
  assert.equal(proxy.calls(), 4);
});

test("認證失敗不回 200；修復後可正常請求", async (t) => {
  const proxy = await startProxy(t, "auth-error");
  const failure = await proxy.get("/supply");
  assert.equal(failure.status, 503);
  assert.equal(failure.headers.get("cache-control"), "no-store");
  assert.equal(proxy.calls(), 0);
  proxy.state({ mode: "ok" });
  assert.equal((await proxy.get("/supply")).status, 200);
  assert.equal(proxy.calls(), 1);
});
