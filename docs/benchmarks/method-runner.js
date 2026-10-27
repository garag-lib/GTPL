import { methodKey, methodMetrics } from "./method-catalog.js";
import { readMemory, memoryPhaseCount, MEMORY_TIMEOUT_MS } from "./memory.js";
export { readMemory } from "./memory.js";
const BLOCKS = 128;
const median = (values) => {
  const v = [...values].sort((a, b) => a - b),
    i = v.length >> 1;
  return v.length % 2 ? v[i] : (v[i - 1] + v[i]) / 2;
};
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const rows = (size, tick = 0, offset = 0) =>
  Array.from({ length: size }, (_, i) => ({
    id: i + offset,
    label: `Item ${i + offset}`,
    value: tick,
  }));
export function domSnapshot(host) {
  let inertElements = 0,
    inertBlocks = 0;
  function contents(root) {
    for (const node of root.children ?? []) {
      inertElements++;
      if (node.classList.contains("bench-block")) inertBlocks++;
      contents(node);
      if (node.tagName === "TEMPLATE") contents(node.content);
    }
  }
  for (const template of host.querySelectorAll("template"))
    contents(template.content);
  return {
    elements: host.querySelectorAll("*").length,
    branches: host.querySelectorAll(".bench-branch").length,
    blocks: host.querySelectorAll(".bench-block").length,
    inertElements,
    inertBlocks,
  };
}
function waitFor(host, predicate) {
  if (predicate()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(() => {
      if (predicate()) {
        cleanup();
        resolve();
      }
    });
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("La salida del caso no se confirmó en 10 s."));
    }, 10000);
    const cleanup = () => {
      clearTimeout(timer);
      observer.disconnect();
    };
    observer.observe(host, {
      subtree: true,
      attributes: true,
      characterData: true,
      childList: true,
    });
  });
}
function heavyValid(host, active, tick) {
  const branch = host.querySelector(".bench-branch");
  return active === null
    ? !branch
    : branch?.dataset.branch === String(active) &&
        host.querySelectorAll(".bench-block").length === BLOCKS &&
        host.querySelector(".bench-block:last-child .bench-value")
          ?.textContent === String(tick);
}
function verifyHeavy(host, active, tick) {
  if (
    !heavyValid(host, active, tick) ||
    host.querySelectorAll(".bench-branch").length !== (active === null ? 0 : 1)
  )
    throw new Error("Número incorrecto de ramas o bloques.");
  if (active !== null)
    for (const [index, block] of [
      ...host.querySelectorAll(".bench-block"),
    ].entries())
      if (
        block.dataset.block !== String(index) ||
        block.querySelector("h4").textContent !==
          `Vista ${active} · bloque ${index}` ||
        block.querySelector(".bench-value").textContent !== String(tick)
      )
        throw new Error("La rama grande no coincide con el caso elegido.");
}
function listValid(host, data) {
  const nodes = host.querySelectorAll(".method-row");
  return (
    nodes.length === data.length &&
    (!data.length ||
      (nodes[0].dataset.key === String(data[0].id) &&
        nodes[nodes.length - 1].dataset.key === String(data.at(-1).id) &&
        nodes[nodes.length - 1].querySelector("i").textContent ===
          String(data.at(-1).value)))
  );
}
function verifyList(host, data) {
  const nodes = host.querySelectorAll(".method-row");
  if (nodes.length !== data.length)
    throw new Error("Lista de longitud incorrecta.");
  for (let i = 0; i < data.length; i++)
    if (
      nodes[i].dataset.key !== String(data[i].id) ||
      nodes[i].querySelector("b").textContent !== data[i].label ||
      nodes[i].querySelector("i").textContent !== String(data[i].value)
    )
      throw new Error("La lista no coincide tras la operación.");
}
function simpleValid(host, method, state, size) {
  const selector =
    method === "forms"
      ? ".bench-input"
      : method === "attributes"
        ? ".bench-attr"
        : ".bench-box";
  const nodes = host.querySelectorAll(selector);
  if (nodes.length !== size) return false;
  const last = nodes[nodes.length - 1];
  if (method === "forms")
    return (
      last.value === state.text &&
      host.querySelector("output")?.textContent === state.text
    );
  if (method === "classes") return last.classList.contains(state.className);
  if (method === "styles")
    return (
      last.style.width === state.theme.width &&
      last.style.backgroundColor === state.theme.backgroundColor &&
      last.style.color === state.theme.color
    );
  return (
    last.textContent === String(state.tick) &&
    Object.entries(state.attrs).every(
      ([key, value]) => last.getAttribute(key) === value,
    )
  );
}
function verifySimple(host, method, state, size) {
  if (!simpleValid(host, method, state, size))
    throw new Error(
      "La salida de atributos, estilos o formulario no coincide.",
    );
  const nodes = host.querySelectorAll(
    method === "forms"
      ? ".bench-input"
      : method === "attributes"
        ? ".bench-attr"
        : ".bench-box",
  );
  for (const node of nodes) {
    if (
      (method === "forms" && node.value !== state.text) ||
      (method === "classes" && !node.classList.contains(state.className)) ||
      (method === "styles" &&
        Object.entries(state.theme).some(
          ([key, value]) => node.style[key] !== value,
        )) ||
      (method === "attributes" &&
        (node.textContent !== String(state.tick) ||
          Object.entries(state.attrs).some(
            ([key, value]) => node.getAttribute(key) !== value,
          )))
    )
      throw new Error(
        "Salida parcial: no se actualizaron todos los elementos.",
      );
  }
}
export async function runMethod(
  config,
  id,
  host,
  status,
  onProgress = () => {},
) {
  const method = config.method,
    key = methodKey(method, config.cases),
    size = config.size;
  if (!Number.isInteger(size) || size < 0 || size > 3000)
    throw new Error("Tamaño de caso inválido.");
  const chosen = method === "switch" ? (config.activeCase ?? 0) : 0;
  if (
    method === "switch" &&
    (!Number.isInteger(chosen) || chosen < 0 || chosen >= config.cases)
  )
    throw new Error("Rama elegida inválida.");
  const metrics = Object.fromEntries(methodMetrics.map((m) => [m.key, null])),
    snapshots = [],
    operations = {};
  const reportPhase = (phase) => onProgress({ kind: "sample", phase });
  async function record(phase) {
    status.textContent = `${method} · ${phase}${config.memory ? " · leyendo memoria" : ""}`;
    const progress = {
      kind: "memory",
      phase,
      index: snapshots.length + 1,
      total: memoryPhaseCount(config),
      timeoutMs: MEMORY_TIMEOUT_MS,
    };
    if (config.memory) onProgress({ ...progress, reading: true });
    const dom = domSnapshot(host);
    let memory = null;
    if (config.memory)
      try {
        memory = await readMemory();
      } catch (error) {
        error.phase = phase;
        throw error;
      }
    const entry = { phase, dom, memory };
    snapshots.push(entry);
    if (config.memory) onProgress({ ...progress, reading: false });
    return entry;
  }
  // Import after this baseline so template/code residency is included. The
  // parent keeps its results and charts unchanged throughout this sample.
  const baseline = await record("ejecutor vacío");
  reportPhase("cargando plantilla precompilada");
  const { createAdapter } = await import(`./methods/${key}-${id}.js`);
  reportPhase("preparando estado del caso");
  const adapter = createAdapter({
    size: method === "switch" || method === "if" ? 0 : size,
  });
  let state = {
    tick: 0,
    text: "inicial",
    className: "tone-a",
    theme: {
      backgroundColor: "rgb(216, 243, 106)",
      color: "rgb(19, 34, 24)",
      width: "120px",
    },
    attrs: { title: "Estado 0", "data-state": "0", "aria-label": "Estado 0" },
  };
  async function timed(name, operation, predicate, verify) {
    if (document.hidden) throw new Error("La pestaña dejó de estar visible.");
    reportPhase(
      {
        show: "creando vista elegida",
        hide: "retirando vista",
        revisit: "recreando vista",
        visit: "recorriendo ramas",
      }[name] ?? "actualizando vista",
    );
    const start = performance.now();
    await operation();
    await waitFor(host, predicate);
    void host.offsetHeight;
    const elapsed = performance.now() - start;
    verify();
    (operations[name] ??= []).push(elapsed);
    return elapsed;
  }
  try {
    reportPhase("montando estado inicial");
    const start = performance.now();
    await adapter.mount(host);
    const initialData = method === "for" ? rows(size) : [];
    const initialValid = () =>
      method === "switch" || method === "if"
        ? heavyValid(host, null, 0)
        : method === "for"
          ? listValid(host, initialData)
          : simpleValid(host, method, state, size);
    await waitFor(host, initialValid);
    void host.offsetHeight;
    metrics.mountMs = performance.now() - start;
    const initial = await record("definiciones y estado inicial");
    let active = initial;
    if (method === "switch" || method === "if") {
      metrics.inertElements = initial.dom.inertElements;
      const patch =
        method === "switch" ? { active: chosen } : { visible: true };
      metrics.showMs = await timed(
        "show",
        () => adapter.set(patch),
        () => heavyValid(host, chosen, 0),
        () => verifyHeavy(host, chosen, 0),
      );
      active = await record("solo la vista elegida");
      metrics.constructedBlocks = active.dom.blocks;
      if (method === "if" || config.retention) {
        metrics.hideMs = await timed(
          "hide",
          () =>
            adapter.set(
              method === "switch" ? { active: null } : { visible: false },
            ),
          () => heavyValid(host, null, 0),
          () => verifyHeavy(host, null, 0),
        );
        metrics.revisitMs = await timed(
          "revisit",
          () => adapter.set(patch),
          () => heavyValid(host, chosen, 0),
          () => verifyHeavy(host, chosen, 0),
        );
        if (method === "switch")
          for (let branch = 0; branch < config.cases; branch++)
            await timed(
              "visit",
              () => adapter.set({ active: branch }),
              () => heavyValid(host, branch, 0),
              () => verifyHeavy(host, branch, 0),
            );
        await adapter.set(
          method === "switch" ? { active: null } : { visible: false },
        );
        await waitFor(host, () => heavyValid(host, null, 0));
        verifyHeavy(host, null, 0);
        await record("retirada tras visitas");
      }
    } else if (method === "for") {
      for (const [metric, make] of [
        ["updateMs", (i) => rows(size, i + 1)],
        [
          "appendMs",
          (i) => [...rows(size), ...rows(Math.ceil(size * 0.25), i + 1, size)],
        ],
        ["removeMs", (i) => rows(Math.ceil(size / 2), i + 1)],
        ["reverseMs", (i) => rows(size, i + 1).reverse()],
        ["replaceMs", (i) => rows(size, i + 1, size)],
      ]) {
        for (let i = 0; i < 3; i++) {
          const base = rows(size);
          await adapter.set({ rows: base });
          await waitFor(host, () => listValid(host, base));
          const next = make(i);
          await timed(
            metric,
            () => adapter.set({ rows: next }),
            () => listValid(host, next),
            () => verifyList(host, next),
          );
        }
        metrics[metric] = median(operations[metric]);
      }
      active = await record("lista tras operaciones");
    } else {
      function next(tick) {
        if (method === "forms") return { text: `texto ${tick}` };
        if (method === "classes")
          return { className: tick % 2 ? "tone-b" : "tone-a" };
        if (method === "styles")
          return {
            theme:
              tick % 2
                ? {
                    backgroundColor: "rgb(118, 96, 202)",
                    color: "rgb(255, 255, 255)",
                    width: "90px",
                  }
                : {
                    backgroundColor: "rgb(216, 243, 106)",
                    color: "rgb(19, 34, 24)",
                    width: "120px",
                  },
          };
        return {
          tick,
          attrs: {
            title: `Estado ${tick}`,
            "data-state": String(tick),
            "aria-label": `Estado ${tick}`,
          },
        };
      }
      for (let tick = 1; tick <= 10; tick++) {
        const patch = next(tick);
        Object.assign(state, patch);
        await timed(
          method === "forms" ? "inputMs" : "updateMs",
          () =>
            method === "forms" ? adapter.input(patch.text) : adapter.set(patch),
          () => simpleValid(host, method, state, size),
          () => verifySimple(host, method, state, size),
        );
      }
      metrics[method === "forms" ? "inputMs" : "updateMs"] = median(
        operations[method === "forms" ? "inputMs" : "updateMs"],
      );
      const idle = [];
      let previous = await frame(),
        idleStart = previous;
      for (let i = 0; i < 12; i++) {
        const now = await frame();
        idle.push(now - previous);
        previous = now;
        if (now - idleStart >= 1000) break;
      }
      metrics.refreshMs = median(idle);
      const intervals = [];
      const beginning = await frame();
      previous = beginning;
      let tick = 11;
      do {
        if (document.hidden)
          throw new Error("La pestaña dejó de estar visible.");
        const patch = next(tick++);
        Object.assign(state, patch);
        await (method === "forms"
          ? adapter.input(patch.text)
          : adapter.set(patch));
        await waitFor(host, () => simpleValid(host, method, state, size));
        void host.offsetHeight;
        const now = await frame();
        intervals.push(now - previous);
        previous = now;
      } while (previous - beginning < 1200);
      verifySimple(host, method, state, size);
      metrics.fps = (intervals.length * 1000) / (previous - beginning);
      metrics.frameP95Ms = [...intervals].sort((a, b) => a - b)[
        Math.ceil(intervals.length * 0.95) - 1
      ];
      operations.frameIntervals = intervals;
      active = await record("vista tras actualizaciones");
    }
    metrics.activeElements = active.dom.elements;
    const total = (s) => s?.memory?.totalBytes;
    const delta = (a, b) =>
      Number.isFinite(total(a)) && Number.isFinite(total(b))
        ? total(a) - total(b)
        : null;
    metrics.definitionBytes = delta(initial, baseline);
    metrics.activeBytes = delta(active, baseline);
    metrics.activationBytes = delta(active, initial);
    const retired = snapshots.find((s) => s.phase === "retirada tras visitas");
    metrics.retainedBytes = retired ? delta(retired, initial) : null;
    return {
      method,
      key,
      metrics,
      raw: { ...operations, frameIntervals: operations.frameIntervals ?? [] },
      snapshots,
      validated: true,
      workload: {
        declaredCases: method === "switch" ? config.cases : 1,
        blocksPerBranch: method === "switch" || method === "if" ? BLOCKS : null,
        chosenBranch: chosen,
        retention: !!config.retention,
        memoryMethod:
          "environment deltas (JS + DOM), parent held stable; GC uncontrolled",
      },
    };
  } finally {
    reportPhase("liberando vista y bindings");
    await adapter.destroy();
    host.replaceChildren();
  }
}
