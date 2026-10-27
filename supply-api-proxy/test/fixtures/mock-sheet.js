// 僅由 HTTP 測試以 --import 載入；正式映像不包含測試檔案。
import assert from "node:assert/strict";
import { readFileSync, appendFileSync } from "node:fs";
import { GoogleAuth } from "google-auth-library";

const state = () => JSON.parse(readFileSync(process.env.MOCK_SHEET_STATE, "utf8"));
Date.now = () => state().now;

GoogleAuth.prototype.getClient = async function () {
  assert.deepEqual(this.scopes, ["https://www.googleapis.com/auth/spreadsheets.readonly"]);
  if (state().mode === "auth-error") throw new Error("測試認證失敗");
  return {
    async request(options) {
      assert.equal(options.url, "https://sheets.googleapis.com/v4/spreadsheets/test-sheet/values/supply!A2%3A4?valueRenderOption=FORMATTED_VALUE");
      assert.equal(options.timeout, 15000);
      appendFileSync(process.env.MOCK_SHEET_CALLS, "request\n");
      if (state().mode === "upstream-error") throw new Error("測試 Sheets 失敗");
      return { data: { values: state().rows } };
    },
  };
};
