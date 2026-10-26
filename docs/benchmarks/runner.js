const parameters = new URLSearchParams(location.search);
const id = parameters.get("engine");
const token = parameters.get("token");
const allowed = [
  "gtpl",
  "gtpl-jit",
  "vue",
  "react",
  "angular",
  "alpine",
  "vanilla",
];
const host = document.querySelector("#app");
const status = document.querySelector("#runner-status");
const send = (type, payload = {}) =>
  parent.postMessage(
    { channel: "gtpl-bench", token, type, ...payload },
    location.origin,
  );
const pause = () => new Promise((resolve) => setTimeout(resolve, 0));
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const median = (values) => {
  const v = [...values].sort((a, b) => a - b);
  return v.length % 2
    ? v[(v.length - 1) / 2]
    : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};
const percentile = (values, p) =>
  [...values].sort((a, b) => a - b)[
    Math.max(0, Math.ceil(values.length * p) - 1)
  ] ?? null;
const dataFor = (size) => ({
  rows: Array.from({ length: size }, (_, id) => ({ id, label: `Item ${id}` })),
  tick: 0,
  active: 0,
});
let createAdapter;
let busy = false;

// The same DOM completion fence is used for every engine. No fixed sleeps in timings.
// Full output verification follows each measured operation, outside its stopwatch.
function matches(size, tick, active) {
  return (
    host.querySelector(".bench-branch")?.getAttribute("data-branch") ===
      String(active) &&
    host.querySelector('[data-row="0"] i')?.textContent === String(tick) &&
    host.querySelector(`[data-row="${size - 1}"] i`)?.textContent ===
      String(tick)
  );
}
function settled(size, tick, active) {
  if (matches(size, tick, active)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(() => {
      if (matches(size, tick, active)) {
        cleanup();
        resolve();
      }
    });
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("El DOM no alcanzó el resultado esperado en 10 s."));
    }, 10_000);
    const cleanup = () => {
      clearTimeout(timeout);
      observer.disconnect();
    };
    observer.observe(host, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });
  });
}
function verify(size, tick, active) {
  const branches = host.querySelectorAll(".bench-branch");
  const rows = host.querySelectorAll(".bench-row");
  if (
    branches.length !== 1 ||
    branches[0].dataset.branch !== String(active) ||
    rows.length !== size
  )
    throw new Error(
      "Salida no equivalente: número de filas o ramas incorrecto.",
    );
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (
      row.dataset.row !== String(i) ||
      row.children.length !== 3 ||
      row.children[0].textContent !== String(i) ||
      row.children[1].textContent !== `Item ${i}` ||
      row.children[2].textContent !== String(tick)
    )
      throw new Error(`Salida no equivalente en la fila ${i}.`);
  }
}
async function timed(operation, size, tick, active) {
  if (document.hidden)
    throw new Error(
      "La pestaña dejó de estar visible. Repite la prueba en primer plano.",
    );
  const start = performance.now();
  await operation();
  await settled(size, tick, active);
  // Include style/layout work, but not the next vsync or browser paint.
  void host.offsetHeight;
  const elapsed = performance.now() - start;
  verify(size, tick, active);
  return elapsed;
}
function domCount() {
  const walker = document.createTreeWalker(
    host,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT,
  );
  let total = 0;
  while (walker.nextNode()) total++;
  return total;
}
async function memory() {
  if (
    !crossOriginIsolated ||
    typeof performance.measureUserAgentSpecificMemory !== "function"
  )
    return null;
  let result;
  try {
    result = await performance.measureUserAgentSpecificMemory();
  } catch (error) {
    return { bytes: null, error: error.message };
  }
  // Never attribute shared or unknown heap to a framework. An iframe can share
  // its process with the controller; only exclusively attributed entries count.
  const entries = result.breakdown.filter(
    (entry) =>
      entry.attribution.length > 0 &&
      entry.attribution.every((a) => a.url === location.href),
  );
  const attributedBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  return {
    bytes: entries.length ? attributedBytes : null,
    attributedEntries: entries,
    totalReportedBytes: result.bytes,
    excludedSharedOrUnattributedBytes: result.bytes - attributedBytes,
  };
}
async function run(config) {
  const { size, scenarios, memory: collectMemory } = config;
  if (
    !Number.isInteger(size) ||
    size < 10 ||
    size > 5000 ||
    !Array.isArray(scenarios) ||
    scenarios.some((x) => !["mount", "update", "switch", "frames"].includes(x))
  )
    throw new Error("Configuración de benchmark inválida.");
  // Warm the runtime with a smaller, discarded instance. Compilation is offline
  // except GTPL JIT / Alpine; their parsing cost remains in each measured mount.
  let adapter = createAdapter();
  await adapter.mount(host, dataFor(20));
  await settled(20, 0, 0);
  await adapter.update(1, 1);
  await settled(20, 1, 1);
  await adapter.destroy();
  host.replaceChildren();
  adapter = null;
  await pause();
  if (collectMemory) status.textContent = "Memoria · base antes del montaje";
  const baseline = collectMemory ? await memory() : null;
  adapter = createAdapter();
  const values = {
    updates: [],
    switchFirst: [],
    switchRevisit: [],
    frameIntervals: [],
    idleFrameIntervals: [],
  };
  try {
    status.textContent = "Montaje · 1 rama activa de 12";
    const mountMs = await timed(
      () => adapter.mount(host, dataFor(size)),
      size,
      0,
      0,
    );
    const nodes = domCount();
    if (collectMemory) status.textContent = "Memoria · vista montada";
    const mountedMemory = collectMemory ? await memory() : null;
    let afterSwitchMemory = null;
    let tick = 0,
      active = 0;
    if (scenarios.includes("update")) {
      status.textContent = "Actualizando todas las filas";
      for (let i = 0; i < 10; i++) {
        tick++;
        values.updates.push(
          await timed(() => adapter.update(tick, active), size, tick, active),
        );
        await pause();
      }
    }
    if (scenarios.includes("switch")) {
      status.textContent = "Switch · primera visita a las 11 ramas restantes";
      for (active = 1; active < 12; active++) {
        values.switchFirst.push(
          await timed(() => adapter.update(tick, active), size, tick, active),
        );
        await pause();
      }
      status.textContent = "Switch · segunda visita a las 12 ramas";
      for (active = 0; active < 12; active++) {
        values.switchRevisit.push(
          await timed(() => adapter.update(tick, active), size, tick, active),
        );
        await pause();
      }
      active = 11;
      if (collectMemory) {
        status.textContent = "Memoria · después de las revisitas del switch";
        afterSwitchMemory = await memory();
      }
    }
    let fps = null,
      frameP95Ms = null,
      slowFrames = null,
      refreshMs = null;
    if (scenarios.includes("frames")) {
      // Use a fresh view so the FPS scenario does not inherit a previous
      // scenario's branch lifecycle or accumulated state.
      await adapter.destroy();
      host.replaceChildren();
      adapter = createAdapter();
      await adapter.mount(host, dataFor(size));
      await settled(size, 0, 0);
      tick = active = 0;
      await pause();
      status.textContent = "Fluidez · actualizaciones al ritmo de la pantalla";
      let previous = await frame();
      const idleStart = previous;
      for (let i = 0; i < 18; i++) {
        const now = await frame();
        values.idleFrameIntervals.push(now - previous);
        previous = now;
        if (now - idleStart >= 1000) break;
      }
      refreshMs = median(values.idleFrameIntervals);
      const start = await frame();
      previous = start;
      do {
        tick++;
        // Avoid full per-row verification during animation: it would measure the
        // verifier. Check the complete final frame after the sample instead.
        await adapter.update(tick, active);
        await settled(size, tick, active);
        void host.offsetHeight;
        const now = await frame();
        values.frameIntervals.push(now - previous);
        previous = now;
        if (document.hidden)
          throw new Error(
            "La pestaña dejó de estar visible durante la animación.",
          );
      } while (previous - start < 1200);
      verify(size, tick, active);
      fps = (values.frameIntervals.length * 1000) / (previous - start);
      frameP95Ms = percentile(values.frameIntervals, 0.95);
      slowFrames =
        (values.frameIntervals.filter((ms) => ms > refreshMs * 1.5).length /
          values.frameIntervals.length) *
        100;
    }
    status.textContent = "Resultado validado · todas las filas coinciden";
    return {
      metrics: {
        mountMs: scenarios.includes("mount") ? mountMs : null,
        updateMs: values.updates.length ? median(values.updates) : null,
        switchFirstMs: values.switchFirst.length
          ? median(values.switchFirst)
          : null,
        switchRevisitMs: values.switchRevisit.length
          ? median(values.switchRevisit)
          : null,
        fps,
        frameP95Ms,
        slowFrames,
        refreshMs,
        domNodes: nodes,
        memoryBytes:
          Number.isFinite(baseline?.bytes) &&
          Number.isFinite(mountedMemory?.bytes)
            ? mountedMemory.bytes - baseline.bytes
            : null,
        memoryMountedBytes: mountedMemory?.bytes ?? null,
        memoryAfterSwitchBytes: afterSwitchMemory?.bytes ?? null,
        memoryGrowthBytes:
          Number.isFinite(afterSwitchMemory?.bytes) &&
          Number.isFinite(mountedMemory?.bytes)
            ? afterSwitchMemory.bytes - mountedMemory.bytes
            : null,
      },
      raw: values,
      memory: {
        baseline,
        mounted: mountedMemory,
        afterSwitch: afterSwitchMemory,
        method: "exclusive-url-attribution",
        gcControlled: false,
      },
      validated: true,
    };
  } finally {
    await adapter.destroy();
    adapter = null;
    host.replaceChildren();
  }
}

addEventListener("message", async (event) => {
  if (
    event.source !== parent ||
    event.origin !== location.origin ||
    event.data?.channel !== "gtpl-bench" ||
    event.data.token !== token ||
    event.data.type !== "run" ||
    busy
  )
    return;
  busy = true;
  try {
    send("result", { result: await run(event.data.config) });
  } catch (error) {
    send("error", { error: error.message });
  }
});
try {
  if (!allowed.includes(id) || parent === window)
    throw new Error("Abre este ejecutor desde benchmarks.html.");
  ({ createAdapter } = await import(`./vendor/${id}.js`));
  send("ready");
} catch (error) {
  status.textContent = error.message;
  send("error", { error: error.message });
}
