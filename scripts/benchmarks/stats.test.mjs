import test from "node:test";
import assert from "node:assert/strict";
import { summarize, comparison, metrics } from "../../docs/benchmarks/stats.js";

test("summary excludes unavailable values and preserves a signed memory delta", () => {
  assert.equal(summarize([null, undefined, NaN]), null);
  assert.deepEqual(summarize([9, 1, null, 5, 3]), {
    n: 4,
    median: 4,
    min: 1,
    max: 9,
    p95: 9,
  });
  assert.equal(summarize([-100, 0, 100]).median, 0);
});

test("comparison respects metric direction, sample counts and overlap", () => {
  const a = summarize([1, 2, 3]),
    b = summarize([2, 4, 6]);
  assert.deepEqual(comparison(a, b, metrics[0]), {
    winner: "a",
    ratio: 2,
    overlap: true,
  });
  assert.deepEqual(comparison(a, b, metrics[4]), {
    winner: "b",
    ratio: 2,
    overlap: true,
  });
  assert.equal(comparison(a, summarize([4]), metrics[0]).winner, null);
  assert.equal(comparison(a, b, metrics[5]).winner, null);
  assert.equal(comparison(a, summarize([1, 2.01, 3]), metrics[0]).winner, null);
  assert.equal(comparison(summarize([0, 0, 0]), b, metrics[0]).winner, null);
});
