import { localizedError, t, formatNumber } from "./i18n.js";
import {
  gridSizes,
  createGridWorkload,
  gridChecksum,
} from "./grid-workload.js";

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const median = (values) => {
  const v = [...values].sort((a, b) => a - b),
    m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const p95 = (values) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];

function assertVisible() {
  if (document.hidden)
    throw localizedError("The grid is no longer visible; sample discarded.", "El grid dejó de estar visible; muestra descartada.");
}
function verify(nodes, expected) {
  if (nodes.length !== expected.length)
    throw localizedError("The grid has an incorrect cell count.", "El grid tiene un número incorrecto de celdas.");
  for (let i = 0; i < nodes.length; i++)
    if (
      nodes[i].dataset.cell !== String(i) ||
      nodes[i].dataset.value !== String(expected[i]) ||
      nodes[i].textContent !== String(expected[i])
    )
      throw localizedError(`Grid mismatch in cell ${formatNumber(i)}.`, `El grid no coincide en la celda ${formatNumber(i)}.`);
}
export function waitForGridUpdate(host, nodes, batch) {
  // Every selected cell must complete, even if an adapter applies asynchronous
  // work in a different order. Correct boundary cells alone are insufficient.
  const valid = () => {
    for (let i = 0; i < batch.indices.length; i++) {
      const node = nodes[batch.indices[i]], expected = String(batch.values[i]);
      if (node.textContent !== expected || node.dataset.value !== expected) return false;
    }
    return true;
  };
  if (valid()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(() => {
      if (valid()) {
        cleanup();
        resolve();
      }
    });
    const timer = setTimeout(() => {
      cleanup();
      reject(localizedError("The grid did not confirm its updates within 10 s.", "El grid no confirmó sus cambios en 10 s."));
    }, 10000);
    const cleanup = () => {
      observer.disconnect();
      clearTimeout(timer);
    };
    observer.observe(host, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
  });
}

export async function runGrid(config, createAdapter, host, status) {
  const sizes = gridSizes(config.grid);
  const { percent, durationMs, seed } = config.grid;
  if (
    ![10, 25, 100].includes(percent) ||
    !Number.isInteger(durationMs) ||
    durationMs < 1000 ||
    durationMs > 5000 ||
    !Number.isInteger(seed)
  )
    throw localizedError("Invalid animation configuration.", "Configuración de animación inválida.");
  const result = [];
  // Discard a small component tree to warm the engine before its size sweep.
  let adapter = createAdapter();
  host.style.setProperty("--grid-cols", 4);
  host.style.setProperty("--grid-rows", 4);
  await adapter.mount(host, { columns: 4, rows: 4 });
  const warm = createGridWorkload(16, 100, seed),
    batch = warm.next();
  await adapter.update(batch);
  await waitForGridUpdate(host, [...host.querySelectorAll(".grid-cell")], batch);
  await adapter.destroy();
  host.replaceChildren();
  adapter = null;
  for (const [level, size] of sizes.entries()) {
    assertVisible();
    const cells = size.columns * size.rows;
    host.style.setProperty("--grid-cols", size.columns);
    host.style.setProperty("--grid-rows", size.rows);
    adapter = createAdapter();
    status.textContent = t(`Grid ${level + 1}/${sizes.length} · ${size.columns} × ${size.rows} · ${formatNumber(cells)} cells · ${percent}% per frame`, `Grid ${level + 1}/${sizes.length} · ${size.columns} × ${size.rows} · ${formatNumber(cells)} celdas · ${percent}% por frame`);
    try {
      await adapter.mount(host, size);
      const nodes = [...host.querySelectorAll(".grid-cell")];
      const work = createGridWorkload(cells, percent, (seed + level) >>> 0);
      verify(nodes, work.expected);
      const idle = [];
      let previous = await frame(),
        idleStart = previous;
      for (let i = 0; i < 12; i++) {
        const now = await frame();
        idle.push(now - previous);
        previous = now;
        if (now - idleStart >= 1000) break;
      }
      const refreshMs = median(idle);
      const intervals = [],
        updates = [],
        dispatch = [],
        apply = [],
        layout = [],
        generation = [];
      const start = await frame();
      previous = start;
      do {
        assertVisible();
        const generationStart = performance.now(),
          batch = work.next();
        generation.push(performance.now() - generationStart);
        const updateStart = performance.now();
        const completion = adapter.update(batch);
        // Diagnostic only: this can exclude async DOM work. updateMs below is
        // the comparable metric and includes the complete DOM/layout fence.
        dispatch.push(performance.now() - updateStart);
        await completion;
        await waitForGridUpdate(host, nodes, batch);
        const domComplete = performance.now();
        void host.offsetHeight;
        const layoutComplete = performance.now();
        apply.push(domComplete - updateStart);
        layout.push(layoutComplete - domComplete);
        updates.push(layoutComplete - updateStart);
        const now = await frame();
        intervals.push(now - previous);
        previous = now;
      } while (previous - start < durationMs);
      verify(nodes, work.expected);
      const elapsedMs = previous - start,
        frames = intervals.length;
      result.push({
        ...size,
        cells,
        level,
        percent,
        updatesPerFrame: work.count,
        frames,
        elapsedMs,
        fps: (frames * 1000) / elapsedMs,
        frameP95Ms: p95(intervals),
        updateMs: median(updates),
        dispatchMs: median(dispatch),
        applyMs: median(apply),
        layoutMs: median(layout),
        generationMs: median(generation),
        updatesPerSecond: (frames * work.count * 1000) / elapsedMs,
        refreshMs,
        slowFrames:
          (intervals.filter((ms) => ms > refreshMs * 1.5).length / frames) *
          100,
        seed: (seed + level) >>> 0,
        checksum: gridChecksum(work.expected),
        validated: true,
        raw: {
          frameIntervals: intervals,
          updateTimes: updates,
          dispatchTimes: dispatch,
          applyTimes: apply,
          layoutTimes: layout,
          generationTimes: generation,
          idleFrameIntervals: idle,
        },
      });
    } finally {
      await adapter.destroy();
      adapter = null;
      host.replaceChildren();
    }
  }
  return {
    grid: result,
    metrics: {},
    timing: {
      updateMs: "adapter + returned promise + all modified DOM cells + layout",
      dispatchMs: "immediate adapter call only; excludes deferred work",
      applyMs: "adapter + returned promise + all modified DOM cells; before layout read",
      layoutMs: "forced layout read after DOM completion",
    },
    raw: { frameIntervals: [] },
    validated: true,
  };
}
