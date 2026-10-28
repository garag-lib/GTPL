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

test('canvas grid output validation rejects incomplete and stale builder snapshots', async () => {
  const { verifyGridSnapshot } = await import('../../docs/benchmarks/grid-runner.js');
  verifyGridSnapshot([1, 2, 3], new Uint32Array([1, 2, 3]));
  assert.throws(() => verifyGridSnapshot([1, 3], [1, 2, 3]), /cell count|número/);
  assert.throws(() => verifyGridSnapshot([1, 0, 3], [1, 2, 3]), /cell|celda/);
  // Sparse batches validate each selected builder, including the middle one.
  verifyGridSnapshot([9, 7], new Uint32Array([9, 7]));
  assert.throws(() => verifyGridSnapshot([9, 0, 7], [9, 8, 7]), /cell|celda/);
});

test('grid completion waits for a delayed middle cell, including its attribute and text', async () => {
  const { JSDOM } = await import('jsdom');
  const { waitForGridUpdate } = await import('../../docs/benchmarks/grid-runner.js');
  const dom = new JSDOM('<main><span data-value="1">1</span><span data-value="0">0</span><span data-value="3">3</span></main>');
  const previous = globalThis.MutationObserver;
  globalThis.MutationObserver = dom.window.MutationObserver;
  try {
    const host = dom.window.document.querySelector('main');
    const nodes = [...host.children];
    const batch = { indices: new Uint32Array([0, 1, 2]), values: new Uint32Array([1, 2, 3]) };
    let completed = false;
    const done = waitForGridUpdate(host, nodes, batch).then(() => { completed = true; });
    await new Promise(resolve => setImmediate(resolve));
    const resolvedBeforeMiddle = completed;
    nodes[1].dataset.value = '2';
    await new Promise(resolve => setImmediate(resolve));
    const resolvedBeforeText = completed;
    nodes[1].textContent = '2';
    await done;
    assert.equal(resolvedBeforeMiddle, false, 'correct boundary cells cannot hide a pending middle cell');
    assert.equal(resolvedBeforeText, false, 'both DOM outputs must be current');
    assert.equal(completed, true);
  } finally {
    if (previous === undefined) delete globalThis.MutationObserver;
    else globalThis.MutationObserver = previous;
    dom.window.close();
  }
});
