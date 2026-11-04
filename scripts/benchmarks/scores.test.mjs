import test from 'node:test';
import assert from 'node:assert/strict';
import { efficiencyScore } from '../../docs/benchmarks/scores.js';

test('a longer bar always means better, without changing the raw units', () => {
  const raw = [10, 20, 40];
  assert.deepEqual(raw.map(v => efficiencyScore(v, raw, 'lower')), [100, 50, 25]);
  assert.deepEqual(raw.map(v => efficiencyScore(v, raw, 'higher')), [25, 50, 100]);
  assert.deepEqual(raw, [10, 20, 40]);
  assert.equal(efficiencyScore(10, [null, NaN, 10], 'lower'), 100);
});
test('unknown values, zero timings and signed memory deltas do not become winners', () => {
  for (const value of [null, undefined, NaN, Infinity, 0, -10])
    assert.equal(efficiencyScore(value, [10, value]), null);
  assert.equal(efficiencyScore(10, [10, 20], 'none'), null);
});
