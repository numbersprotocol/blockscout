// NUM token supply API served at https://mainnet.num.network/supply
// (nginx on mainnet-explorer -> this service on :3000).
//
// Consumers: CoinGecko (GET /supply), Coinranking and others
// (GET /supply?result=total_supply_text | circulating_supply_text).
//
// Data source: Google Sheet "Numbers Token Supply API Data Source", tab
// `supply`, rows 2-4 = date / total_supply / circulating_supply. The value
// served is the column with the latest date that is <= today (UTC).
//
// Response contract (kept identical to the former Apps Script backend):
//   GET /supply                                   -> application/json
//       {"total_supply": <number>, "circulating_supply": <number>}
//   GET /supply?result=total_supply_text         -> text/plain  <number>
//   GET /supply?result=circulating_supply_text   -> text/plain  <number>
//
// Upstream failures never return HTTP 200 with an error body: the last good
// value is served for up to STALE_MAX_MS, otherwise HTTP 503.

import express from "express";
import { GoogleAuth } from "google-auth-library";

const PORT = Number(process.env.PORT || 3000);
const SHEET_ID =
  process.env.SHEET_ID || "1kT6ARBK9VJyjFuBpgJWgL21Vo7Ky-YAgWAA5RsG1N5I";
const SHEET_RANGE = process.env.SHEET_RANGE || "supply!A2:4";
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 5 * 60 * 1000);
const STALE_MAX_MS = Number(process.env.STALE_MAX_MS || 24 * 60 * 60 * 1000);

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

let cache = null; // { data, fetchedAt }
let inflight = null;

// Sheet dates are formatted strings such as "6/25/2026" (M/D/YYYY).
export function parseSheetDate(value) {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
}

export function parseAmount(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return NaN;
  const cleaned = value.replace(/,/g, "").trim();
  return cleaned === "" ? NaN : Number(cleaned);
}

// rows: [["date", d1, d2, ...], ["total_supply", ...], ["circulating_supply", ...]]
export function pickSupply(rows, now = new Date()) {
  const byLabel = {};
  for (const row of rows || []) {
    if (Array.isArray(row) && typeof row[0] === "string") {
      byLabel[row[0].trim()] = row;
    }
  }
  const dates = byLabel.date;
  const total = byLabel.total_supply;
  const circ = byLabel.circulating_supply;
  if (!dates || !total || !circ) {
    throw new Error("sheet layout unexpected: missing date/total_supply/circulating_supply rows");
  }
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  let best = -1;
  let bestTime = -Infinity;
  for (let i = 1; i < dates.length; i++) {
    const t = parseSheetDate(dates[i]);
    if (t === null || t > today) continue;
    const ts = parseAmount(total[i]);
    const cs = parseAmount(circ[i]);
    if (!Number.isFinite(ts) || !Number.isFinite(cs)) continue;
    if (t >= bestTime) {
      bestTime = t;
      best = i;
    }
  }
  if (best === -1) throw new Error("no valid supply column dated on or before today");
  return {
    total_supply: parseAmount(total[best]),
    circulating_supply: parseAmount(circ[best]),
    as_of: new Date(bestTime).toISOString().slice(0, 10),
  };
}

async function fetchFromSheet() {
  const client = await auth.getClient();
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/` +
    `${encodeURIComponent(SHEET_RANGE)}?valueRenderOption=FORMATTED_VALUE`;
  const res = await client.request({ url, timeout: 15000 });
  return pickSupply(res.data.values);
}

async function getSupply() {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache;
  if (!inflight) {
    inflight = fetchFromSheet()
      .then((data) => {
        cache = { data, fetchedAt: Date.now() };
        return cache;
      })
      .finally(() => {
        inflight = null;
      });
  }
  try {
    return await inflight;
  } catch (err) {
    console.error(new Date().toISOString(), "sheet fetch failed:", err.message);
    if (cache && now - cache.fetchedAt < STALE_MAX_MS) return cache;
    throw err;
  }
}

const app = express();
app.disable("x-powered-by");

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.get(["/supply", "/supply/"], async (req, res) => {
  let entry;
  try {
    entry = await getSupply();
  } catch {
    res.set("Cache-Control", "no-store");
    return res.status(503).json({ error: "supply data temporarily unavailable" });
  }
  const { total_supply, circulating_supply, as_of } = entry.data;
  res.set("Cache-Control", "public, max-age=300");
  res.set("X-Supply-As-Of", as_of);

  switch (req.query.result) {
    case "total_supply_text":
      return res.type("text/plain").send(String(total_supply));
    case "circulating_supply_text":
      return res.type("text/plain").send(String(circulating_supply));
    default:
      return res.json({ total_supply, circulating_supply });
  }
});

app.use((_req, res) => res.status(404).json({ error: "not found" }));

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => console.log(`supply-api-proxy listening on ${PORT}`));
}
