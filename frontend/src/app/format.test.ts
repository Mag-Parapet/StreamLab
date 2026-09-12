import { test } from "node:test";
import assert from "node:assert/strict";
import { bytes, duration, percent } from "./format";
test("unavailable values stay distinguishable from zero", () => {
  assert.equal(bytes(null), "—");
  assert.equal(bytes(0), "0 B");
  assert.equal(duration(null), "—");
  assert.equal(duration(0), "00:00:00");
});
test("long streams and byte units", () => {
  assert.equal(duration(90061), "25:01:01");
  assert.equal(bytes(8 * 1024 ** 3), "8.0 GB");
  assert.equal(percent(2, 0), 0);
  assert.equal(percent(11, 10), 100);
});
