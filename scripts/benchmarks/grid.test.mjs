import test from "node:test";
import assert from "node:assert/strict";
import {
  gridSizes,
  createGridWorkload,
  gridChecksum,
} from "../../docs/benchmarks/grid-workload.js";

test("grid grows both axes and rejects excessive dimensions", () => {
  assert.deepEqual(gridSizes({ columns: 4, rows: 6, step: 2, levels: 3 }), [
    { columns: 4, rows: 6 },
    { columns: 6, rows: 8 },
    { columns: 8, rows: 10 },
  ]);
  assert.throws(() =>
    gridSizes({ columns: 64, rows: 64, step: 32, levels: 4 }),
  );
  assert.throws(() => gridSizes({ columns: 2, rows: 2, step: 0, levels: 3 }));
});
test("all engines receive an identical deterministic sequence prefix at every density", () => {
  for (const percent of [10, 25, 100]) {
    const a = createGridWorkload(100, percent, 42),
      b = createGridWorkload(100, percent, 42);
    for (let frame = 0; frame < 30; frame++) {
      const before = Array.from(a.expected),
        x = a.next(),
        y = b.next();
      assert.deepEqual(x, y);
      assert.equal(new Set(x.indices).size, a.count);
      assert.equal(
        a.expected.filter((value, i) => value !== before[i]).length,
        a.count,
      );
      assert.equal(gridChecksum(a.expected), gridChecksum(b.expected));
    }
  }
});
