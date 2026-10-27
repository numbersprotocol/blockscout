import { test } from "node:test";
import assert from "node:assert/strict";
import { pickSupply, parseSheetDate } from "../server.js";

// Excerpt of the real sheet layout (row 2-4 of tab `supply`), including the
// out-of-order first column and blank date cells.
const rows = [
  ["date", "11/18/2023", "", "", "", "1/17/2022", "10/28/2025", "11/27/2025", "12/27/2025", "6/25/2026"],
  ["total_supply", "42,382,500.00", "42,382,500.00", "42,382,500.00", "42,382,500.00", "53,017,500.00",
    "853,615,317.00", "863,575,317.00", "867,535,317.00", "914,075,317.00"],
  ["circulating_supply", "42,347,475.00", "42,347,475.00", "42,347,475.00", "42,347,475.00", "52,982,475.00",
    "843,552,333.00", "853,512,333.00", "857,472,333.00", "904,012,333.00"],
];

test("matches archived response of 2025-11-24 (Wayback)", () => {
  const r = pickSupply(rows, new Date("2025-11-24T20:26:11Z"));
  assert.equal(r.total_supply, 853615317);
  assert.equal(r.circulating_supply, 843552333);
});

test("matches archived circulating_supply_text of 2026-01-11 (Wayback)", () => {
  const r = pickSupply(rows, new Date("2026-01-11T01:20:07Z"));
  assert.equal(r.circulating_supply, 857472333);
});

test("uses latest column on or before today, ignoring future dates", () => {
  assert.equal(pickSupply(rows, new Date("2026-06-24T23:00:00Z")).circulating_supply, 857472333);
  assert.equal(pickSupply(rows, new Date("2026-06-25T00:00:00Z")).circulating_supply, 904012333);
  assert.equal(pickSupply(rows, new Date("2026-10-13T00:00:00Z")).as_of, "2026-06-25");
});

test("skips #REF! / non-numeric cells and throws when nothing is usable", () => {
  const broken = [["date", "#REF!"], ["total_supply", "#REF!"], ["circulating_supply", "#REF!"]];
  assert.throws(() => pickSupply(broken, new Date("2026-10-13T00:00:00Z")));
  assert.throws(() => pickSupply([], new Date()));
});

test("parseSheetDate", () => {
  assert.equal(parseSheetDate("6/25/2026"), Date.UTC(2026, 5, 25));
  assert.equal(parseSheetDate(""), null);
  assert.equal(parseSheetDate("#REF!"), null);
});
