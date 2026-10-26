import { methodExample } from "./method-examples.js";
import {
  METHODS,
  methodMetrics as metrics,
  selectedMetrics,
  methodKey,
} from "./method-catalog.js";
import { summarize, comparison } from "./stats.js";
import { gridSizes } from "./grid-workload.js";
import { renderGridCharts } from "./grid-charts.js";
import {
  createMemoryExecutor,
  memoryPhaseCount,
  MEMORY_TIMEOUT_MS,
} from "./memory.js";

const $ = (selector) => document.querySelector(selector);
const engines = {
  gtpl: { name: "GTPL AOT", note: "Plantilla precompilada · DOM directo" },
  "gtpl-jit": {
    name: "GTPL JIT",
    note: "Compilación de plantilla incluida en el montaje",
  },
  react: {
    name: "React",
    note: "Producción · render confirmado con flushSync",
  },
  vue: { name: "Vue", note: "Plantilla precompilada · directivas nativas" },
  alpine: {
    name: "Alpine",
    note: "Directivas HTML · interpretación al montar",
  },
  angular: { name: "Angular", note: "AOT · sin Zone.js" },
  vanilla: {
    name: "JavaScript directo",
    note: "Referencia manual · sin runtime de framework",
  },
};
const number = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });
let manifest,
  runData,
  running = false,
  controller;
const controls = [...document.querySelectorAll(".arena select, .arena input")];
const method = () => $("#method").value;
const pair = () => [$("#engine-a").value, $("#engine-b").value];
const numeric = (value, metric) =>
  metric.unit === "MiB" ? value / 1024 ** 2 : value;
const formatted = (value, metric) =>
  Number.isFinite(value)
    ? `${number.format(numeric(value, metric))} ${metric.unit}`
    : "N/D";
const stats = (id, key) =>
  summarize(
    (runData?.samples[id] ?? []).map((sample) => sample.result.metrics[key]),
  );
const getMetric = (key) => metrics.find((metric) => metric.key === key);

function element(tag, text, className) {
  const result = document.createElement(tag);
  if (text !== undefined) result.textContent = text;
  if (className) result.className = className;
  return result;
}
function bar(container, label, value, max, metric, rival, pending = false) {
  const row = element("div", undefined, "bar-row");
  const labels = element("div", undefined, "bar-label");
  labels.append(
    element("span", label),
    element(
      "b",
      value === null ? (pending ? "—" : "N/D") : formatted(value, metric),
    ),
  );
  const track = element("div", undefined, "bar-track");
  const fill = element("div", undefined, `bar-fill${rival ? " rival" : ""}`);
  // Signed memory deltas are shown as magnitudes with their signed value above.
  // They are never used to rank engines.
  fill.style.width =
    value === null || max <= 0
      ? "0%"
      : `${Math.max(0, Math.min(100, (Math.abs(value) / max) * 100))}%`;
  if (value === null) track.classList.add("empty-bar");
  track.append(fill);
  row.append(labels, track);
  container.append(row);
}
function renderCharts() {
  const [a, b] = pair();
  $("#charts").replaceChildren();
  for (const metric of selectedMetrics(method())) {
    const card = element("article", undefined, "chart-card"),
      header = element("header");
    header.append(
      element("h3", metric.title),
      element(
        "span",
        metric.kind === "memory"
          ? "JS+DOM · EXPERIMENTAL"
          : metric.kind === "count"
            ? "DOM · VERIFICADO"
            : metric.direction === "higher"
              ? "↑ MÁS"
              : "↓ MENOS",
        "direction",
      ),
    );
    card.append(header, element("p", metric.note, "chart-note"));
    const av = stats(a, metric.key),
      bv = stats(b, metric.key),
      max = Math.max(Math.abs(av?.median ?? 0), Math.abs(bv?.median ?? 0));
    const pending = (id) =>
      !runData ||
      (running &&
        !runData.samples[id].length &&
        (metric.kind !== "memory" ||
          (runData.config.memory && !runData.memoryWarnings.length)));
    bar(
      card,
      engines[a].name,
      av?.median ?? null,
      max,
      metric,
      false,
      pending(a),
    );
    bar(
      card,
      engines[b].name,
      bv?.median ?? null,
      max,
      metric,
      true,
      pending(b),
    );
    const foot = element("div", undefined, "metric-footer");
    if (metric.kind === "memory")
      foot.textContent = !runData
        ? "Pendiente · activa memoria para medir MiB"
        : !runData.config.memory
          ? "Memoria desactivada; el DOM sí se verifica."
          : runData.memoryWarnings.length
            ? av || bv
              ? "Lecturas parciales: API sin respuesta; faltantes como N/D."
              : "API sin respuesta: RAM N/D; DOM y tiempos verificados."
            : av || bv
              ? "Deltas del entorno JS+DOM · puede intervenir el GC"
              : running
                ? "Medición en curso; la fase y la espera aparecen en el ejecutor."
                : "API no disponible o lectura fallida.";
    else if (metric.direction === "none")
      foot.textContent =
        av || bv
          ? "Recuento real; incluye plantillas inertes por separado."
          : "Pendiente de medición";
    else if (!runData) foot.textContent = "Pendiente de medición";
    else {
      const verdict = comparison(av, bv, metric);
      foot.textContent = verdict.winner
        ? `${engines[verdict.winner === "a" ? a : b].name}: ${metric.direction === "higher" ? number.format(verdict.ratio) + "× la cadencia" : number.format((1 - 1 / verdict.ratio) * 100) + "% menos tiempo"}${verdict.overlap ? " · rangos solapados" : ""}`
        : verdict.text;
      if (metric.key === "fps") {
        const cadenceA = stats(a, "refreshMs")?.median,
          cadenceB = stats(b, "refreshMs")?.median;
        if (
          [a, b].some((id) =>
            runData.samples[id].some(
              (sample) => sample.result.raw.frameIntervals.length < 12,
            ),
          )
        )
          foot.textContent = "Pocos frames observados; cociente omitido.";
        else if (
          cadenceA &&
          cadenceB &&
          Math.max(cadenceA, cadenceB) / Math.min(cadenceA, cadenceB) > 1.25
        )
          foot.textContent =
            "Cadencias de reposo diferentes; cociente omitido.";
      }
    }
    card.append(foot);
    $("#charts").append(card);
  }
  $("#table-a").textContent = engines[a].name;
  $("#table-b").textContent = engines[b].name;
  $("#result-table").replaceChildren();
  for (const metric of selectedMetrics(method(), true)) {
    const row = element("tr"),
      th = element("th", metric.title);
    th.scope = "row";
    row.append(th);
    for (const id of [a, b]) {
      const stat = stats(id, metric.key),
        td = element("td", stat ? formatted(stat.median, metric) : "N/D");
      if (stat)
        td.append(
          element(
            "small",
            `p95 ${formatted(stat.p95, metric)} · rango ${formatted(stat.min, metric)} – ${formatted(stat.max, metric)} · n=${stat.n}`,
          ),
        );
      row.append(td);
    }
    $("#result-table").append(row);
  }
  renderSamples();
  renderVerdict();
  renderGridCharts({ runData, engines, pair: pair() });
}
function renderVerdict() {
  const [a, b] = pair();
  const box = $("#verdict");
  const title = box.querySelector("b"),
    description = box.querySelector("p");
  if (!runData) {
    title.textContent = "Elige dos motores y un caso programático.";
    description.textContent =
      "Cada patrón tiene su objetivo: switch se centra en memoria y creación de vistas.";
    return;
  }
  const validA = runData.samples[a].length,
    validB = runData.samples[b].length;
  title.textContent = `${validA} / ${runData.config.count} muestras de ${engines[a].name} · ${validB} / ${runData.config.count} de ${engines[b].name}`;
  description.textContent = running
    ? "Comparación en curso. Cada resultado se valida antes de incorporarse."
    : runData.errors.length
      ? `Hay ${runData.errors.length} muestra(s) fallida(s) o interrumpida(s). Consulta el JSON para ver el detalle; no se convierten en ceros.`
      : runData.cancelled
        ? "Ejecución detenida. Se conservan las muestras completas."
        : runData.memoryWarnings.length
          ? "La API de memoria superó el límite de espera. La comparación continuó en ejecutores nuevos sin memoria; las lecturas faltantes son N/D. Consulta el JSON para ver el detalle."
          : "Medianas del caso elegido. Código y plantillas residen en memoria; los recuentos distinguen vista activa y contenido inerte. Los deltas de memoria pueden variar por el GC.";
}

function renderSamples() {
  const container = $("#samples-chart");
  container.replaceChildren();
  const [a, b] = pair(),
    metric = getMetric($("#sample-metric").value);
  if (!metric) {
    container.append(
      element("div", "Selecciona una métrica del caso.", "sample-empty"),
    );
    return;
  }
  const groups = [a, b].map((id) =>
    (runData?.samples[id] ?? []).filter((s) =>
      Number.isFinite(s.result.metrics[metric.key]),
    ),
  );
  const values = groups.flatMap((samples) =>
    samples.map((s) => numeric(s.result.metrics[metric.key], metric)),
  );
  if (!values.length) {
    container.append(
      element(
        "div",
        "Las muestras aparecerán aquí al ejecutar este escenario.",
        "sample-empty",
      ),
    );
    return;
  }
  const width = 500,
    height = 180,
    left = 64,
    right = 16,
    top = 17,
    bottom = 32;
  let min = Math.min(0, ...values),
    max = Math.max(0, ...values);
  if (min === max) max = min + 1;
  max += (max - min) * 0.12;
  const y = (value) =>
    height - bottom - ((value - min) / (max - min)) * (height - bottom - top);
  const rounds = runData.config.count;
  const x = (round) => left + ((round + 0.5) / rounds) * (width - left - right);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  const title = document.createElementNS(ns, "title");
  title.textContent = `${metric.title} en ${metric.unit}, por ronda. Los valores completos están en la tabla de resultados y la exportación JSON.`;
  svg.append(title);
  const make = (tag, attrs, text) => {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs))
      node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    svg.append(node);
    return node;
  };
  for (let i = 0; i <= 3; i++) {
    const value = min + ((max - min) / 3) * i;
    make("line", {
      x1: left,
      x2: width - right,
      y1: y(value),
      y2: y(value),
      class: "gridline",
    });
    make(
      "text",
      { x: left - 9, y: y(value) + 3, "text-anchor": "end" },
      number.format(value),
    );
  }
  for (let i = 0; i < rounds; i++)
    make(
      "text",
      { x: x(i), y: height - 8, "text-anchor": "middle" },
      String(i + 1),
    );
  make("text", { x: left, y: 9 }, metric.unit);
  groups.forEach((samples, index) => {
    for (const sample of samples) {
      const value = sample.result.metrics[metric.key];
      const node = make(
        index ? "rect" : "circle",
        index
          ? {
              x: x(sample.round) + 1,
              y: y(numeric(value, metric)) - 3,
              width: 6,
              height: 6,
              class: "sample-b",
            }
          : {
              cx: x(sample.round) - 4,
              cy: y(numeric(value, metric)),
              r: 3.5,
              class: "sample-a",
            },
      );
      const tip = document.createElementNS(ns, "title");
      tip.textContent = `${engines[index ? b : a].name} · ronda ${sample.round + 1}: ${formatted(value, metric)}`;
      node.append(tip);
    }
  });
  container.append(svg);
  const legend = element("div", undefined, "sample-legend");
  legend.append(
    element("span", `${engines[a].name} · círculo`),
    element("span", `${engines[b].name} · cuadrado`),
  );
  container.append(legend);
}

function renderPair() {
  const [a, b] = pair(),
    spec = METHODS[method()];
  $("#case-goal").textContent = spec.goal;
  $("#size-field").hidden = !spec.size;
  $("#switch-config").hidden = method() !== "switch";
  $("#grid-config").hidden = method() !== "grid";
  $("#grid-results").hidden = method() !== "grid";
  $("#case-results").hidden = method() === "grid";
  $("#memory").closest("label").hidden = method() === "grid";
  $("#memory-mode").parentElement.hidden =
    crossOriginIsolated || method() === "grid";
  $("#memory").disabled = !memorySupported || method() === "grid";
  const cases = Number($("#cases").value);
  $("#active-case").max = cases - 1;
  if (Number($("#active-case").value) >= cases) $("#active-case").value = 0;
  $("#results-title").textContent = spec.title;
  const previousMetric = $("#sample-metric").value;
  $("#sample-metric").replaceChildren();
  for (const metric of selectedMetrics(method(), true)) {
    const option = element("option", metric.title);
    option.value = metric.key;
    $("#sample-metric").append(option);
  }
  if (selectedMetrics(method(), true).some((m) => m.key === previousMetric))
    $("#sample-metric").value = previousMetric;
  const entries = {};
  for (const [side, id] of [
    ["a", a],
    ["b", b],
  ]) {
    const info = manifest?.frameworks[id];
    $(`#engine-${side}-meta`).textContent =
      `${info?.version ?? ""} · ${engines[id].note}`;
    const example = methodExample(method(), id, cases);
    $(`#code-${side}-title`).textContent = engines[id].name;
    $(`#code-${side}`).textContent = example.code;
    $(`#code-${side}-note`).textContent = example.note;
    $(`#code-${side}-lines`).textContent =
      `${example.code.split("\n").filter((s) => s.trim()).length} líneas del extracto`;
    entries[id] =
      method() === "grid"
        ? manifest?.gridFrameworks[id]
        : manifest?.methods?.[methodKey(method(), cases)]?.[id];
  }
  $("#bundle-chart").replaceChildren();
  const max = Math.max(
    ...[a, b].map((id) => (entries[id]?.gzipBytes ?? 0) / 1024),
  );
  for (const [index, id] of [a, b].entries())
    if (entries[id])
      bar(
        $("#bundle-chart"),
        engines[id].name,
        entries[id].gzipBytes / 1024,
        max,
        { unit: "KiB gzip" },
        !!index,
      );
  const links = $("#source-links");
  links.replaceChildren();
  for (const id of [a, b])
    if (entries[id]) {
      const link = element("a", `${engines[id].name} · entrada ejecutada ↗`);
      link.href = entries[id].file;
      links.append(link);
    }
  for (const [file, label] of method() === "grid"
    ? [["grid-adapters.mjs", "Adaptadores del grid"]]
    : [
        ["method-definitions.mjs", "Plantillas completas"],
        ["method-adapters.mjs", "Adaptadores legibles"],
      ]) {
    const link = element("a", label + " ↗");
    link.href =
      "https://github.com/garag-lib/GTPL/blob/main/scripts/benchmarks/" + file;
    links.append(link);
  }
  $("#actual-template").textContent = methodExample(method(), a, cases).code;
  if (!running) $("#run").disabled = !manifest || a === b;
  $("#run-hint").textContent =
    a === b
      ? "Elige dos motores o modos diferentes."
      : method() === "switch"
        ? "La memoria es la medida principal. Los tiempos quedan como datos secundarios."
        : "Mantén el ejecutor visible mientras se mide.";
  const query = new URLSearchParams({
    method: method(),
    engineA: a,
    engineB: b,
    samples: $("#samples").value,
    cases: String(cases),
    size: $("#size").value,
    active: $("#active-case").value,
    retention: String($("#retention").checked),
  });
  $("#memory-mode").href = "benchmarks/isolated.html?" + query;
  if (memorySupported)
    $("#memory-help").textContent =
      method() === "grid"
        ? "El grid no mide memoria."
        : `${Number($("#samples").value) * 2 * memoryPhaseCount({ method: method(), retention: $("#retention").checked })} lecturas de memoria en total. Cada lectura puede esperar al navegador; límite de ${MEMORY_TIMEOUT_MS / 1000} s. Se mostrará la fase y el tiempo de espera. JS+DOM, no RAM total de Chrome.`;
  renderCharts();
}
function setRunning(value) {
  running = value;
  controls.forEach((control) => {
    control.disabled = value || (control.id === "memory" && !memorySupported);
  });
  $("#run").disabled = value || !manifest || pair()[0] === pair()[1];
  $("#stop").disabled = !value;
  $("#export-json").disabled = $("#export-csv").disabled = value || !runData;
}
function execute(id, config, signal, onProgress) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    const token = crypto.randomUUID();
    iframe.title = `Benchmark real de ${engines[id].name}`;
    iframe.src = `benchmarks/runner.html?engine=${id}&token=${token}&mode=${config.mode === "grid" ? "grid" : "method"}`;
    let heartbeat;
    const cleanup = () => {
      clearTimeout(timeout);
      clearInterval(heartbeat);
      removeEventListener("message", receive);
      signal.removeEventListener("abort", abort);
      iframe.remove();
    };
    const finish = (error, result) => {
      cleanup();
      error ? reject(error) : resolve(result);
    };
    const abort = () =>
      finish(new DOMException("Ejecución detenida.", "AbortError"));
    const timeout = setTimeout(
      () => finish(new Error("Tiempo de espera agotado; muestra descartada.")),
      config.memory ? 240_000 : 120_000,
    );
    const receive = (event) => {
      if (
        event.source !== iframe.contentWindow ||
        event.origin !== location.origin ||
        event.data?.channel !== "gtpl-bench" ||
        event.data.token !== token
      )
        return;
      if (event.data.type === "ready")
        iframe.contentWindow.postMessage(
          { channel: "gtpl-bench", token, type: "run", config },
          location.origin,
        );
      if (event.data.type === "result") finish(null, event.data.result);
      if (event.data.type === "progress" && onProgress) {
        clearInterval(heartbeat);
        const progress = event.data.progress,
          started = performance.now();
        const update = () =>
          onProgress({ ...progress, waitedMs: performance.now() - started });
        update();
        if (progress.reading) heartbeat = setInterval(update, 1000);
      }
      if (event.data.type === "error")
        finish(
          Object.assign(new Error(event.data.error), {
            code: event.data.code,
            phase: event.data.phase,
            timeoutMs: event.data.timeoutMs,
          }),
        );
    };
    addEventListener("message", receive);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    $("#runner-slot").replaceChildren(iframe);
  });
}
async function start() {
  if (running || !manifest) return;
  const [a, b] = pair();
  if (a === b) return;
  const scenarios = [method() === "grid" ? "grid" : "method"];
  if (document.hidden) {
    $("#status").textContent = "Activa esta pestaña para comenzar.";
    return;
  }
  const config = {
    method: method(),
    cases: Number($("#cases").value),
    activeCase: Number($("#active-case").value),
    retention: $("#retention").checked,
    size: Number($("#size").value),
    count: Number($("#samples").value),
    scenarios,
    memory: method() !== "grid" && $("#memory").checked,
    grid: {
      columns: Number($("#grid-columns").value),
      rows: Number($("#grid-rows").value),
      step: Number($("#grid-step").value),
      levels: Number($("#grid-levels").value),
      percent: Number($("#grid-percent").value),
      durationMs: Number($("#grid-duration").value),
      seed: 42,
    },
  };
  if (scenarios.includes("grid")) {
    try {
      gridSizes(config.grid);
    } catch (error) {
      $("#status").textContent = error.message;
      return;
    }
  }
  const first = crypto.getRandomValues(new Uint8Array(1))[0] % 2;
  runData = {
    schema: 2,
    startedAt: new Date().toISOString(),
    engines: [a, b],
    config,
    manifest,
    environment: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      hardwareConcurrency: navigator.hardwareConcurrency ?? null,
      deviceMemoryGiB: navigator.deviceMemory ?? null,
      viewport: { width: innerWidth, height: innerHeight },
      runnerViewport: null,
      devicePixelRatio,
      crossOriginIsolated,
      timing: "DOM commit + forced layout; excludes import and paint",
      memory:
        "environment JS+DOM deltas vs empty runner; parent held stable; includes shared/unattributed DOM; GC uncontrolled; exclusive URL bytes also exported",
    },
    samples: { [a]: [], [b]: [] },
    errors: [],
    memoryWarnings: [],
    order: [],
    cancelled: false,
  };
  controller = new AbortController();
  setRunning(true);
  $("#progress").value = 0;
  $("#progress").max = config.count * 2;
  $("#result-context").textContent =
    `${METHODS[method()].title} · ${method() === "switch" ? config.cases + " ramas × 128 bloques; elegida " + config.activeCase : method() === "if" ? "128 bloques" : method() === "grid" ? "crecimiento X/Y" : config.size + " elementos"} · ${config.count} muestras/motor · memoria ${config.memory ? "activa" : "desactivada"}`;
  $("#live-stage").scrollIntoView({ behavior: "instant", block: "center" });
  const rect = $("#runner-slot").getBoundingClientRect();
  runData.environment.runnerViewport = {
    width: rect.width,
    height: rect.height,
  };
  let done = 0;
  const failed = new Set();
  const executeSample = createMemoryExecutor(execute, (warning) =>
    runData.memoryWarnings.push({ ...warning, round: Math.floor(done / 2) }),
  );
  renderCharts();
  try {
    for (let round = 0; round < config.count; round++) {
      const order = (round + first) % 2 ? [b, a] : [a, b];
      for (const id of order) {
        if (controller.signal.aborted)
          throw new DOMException("Ejecución detenida.", "AbortError");
        runData.order.push({ round, engine: id });
        $("#live-engine").textContent =
          `${engines[id].name} · ronda ${round + 1}/${config.count}`;
        $("#status").textContent =
          `${engines[id].name} · muestra ${round + 1} de ${config.count}${config.memory ? " · la API de memoria puede tardar" : ""}`;
        try {
          if (failed.has(id))
            throw new Error(
              "Motor omitido tras un fallo anterior en esta ejecución.",
            );
          const result = await executeSample(
            id,
            { ...config, mode: method() === "grid" ? "grid" : "method" },
            controller.signal,
            (progress) => {
              const prefix = `${engines[id].name} · muestra ${round + 1} de ${config.count}`;
              if (progress.kind === "memory-fallback") {
                $("#progress").value = done;
                $("#status").textContent =
                  `${prefix} · API de memoria sin respuesta; ejecutando sin RAM (N/D).`;
              } else {
                $("#progress").value =
                  done +
                  (progress.index - (progress.reading ? 1 : 0)) /
                    progress.total;
                $("#status").textContent =
                  `${prefix} · memoria ${progress.index}/${progress.total}: ${progress.phase} · ${progress.reading ? `esperando ${Math.floor(progress.waitedMs / 1000)} s (límite ${progress.timeoutMs / 1000} s)` : "lectura terminada"}`;
              }
            },
          );
          if (
            !result.validated ||
            Object.values(result.metrics).some(
              (value) => value !== null && !Number.isFinite(value),
            )
          )
            throw new Error("Resultado inválido.");
          runData.samples[id].push({ round, result });
        } catch (error) {
          runData.errors.push({ engine: id, round, message: error.message });
          if (error.name === "AbortError") throw error;
          failed.add(id);
        }
        done++;
        $("#progress").value = done;
        renderCharts();
      }
    }
    const errors = runData.errors.length;
    $("#status").textContent = errors
      ? `Finalizado con ${errors} muestra(s) fallida(s). Exporta el JSON para ver el detalle.`
      : runData.memoryWarnings.length
        ? "Comparación terminada y validada. La API de memoria no respondió; lecturas faltantes como N/D."
        : "Comparación terminada. Todas las muestras se han validado.";
  } catch (error) {
    runData.cancelled = true;
    $("#status").textContent =
      error.name === "AbortError"
        ? "Ejecución detenida. Se conservan las muestras válidas."
        : error.message;
  } finally {
    runData.finishedAt = new Date().toISOString();
    $("#runner-slot").replaceChildren(
      element(
        "div",
        "Ejecución finalizada · muestras completas conservadas",
        "sample-empty",
      ),
    );
    $("#live-engine").textContent = "Ejecutor liberado";
    setRunning(false);
    renderCharts();
  }
}

function download(format) {
  if (!runData || running) return;
  let content;
  if (format === "json") content = JSON.stringify(runData, null, 2);
  else {
    const columns = [
        "engine",
        "version",
        "method",
        "cases",
        "active_case",
        "round",
        "metric",
        "value",
        "unit",
        "phase",
        "grid_columns",
        "grid_rows",
        "grid_cells",
        "source_hash",
        "started_at",
      ],
      data = [columns];
    const push = (id, sample, key, value, unit, phase = "", point = {}) =>
      data.push([
        id,
        manifest.frameworks[id].version,
        runData.config.method,
        runData.config.cases,
        runData.config.activeCase,
        sample.round + 1,
        key,
        value ?? "",
        unit,
        phase,
        point.columns ?? "",
        point.rows ?? "",
        point.cells ?? "",
        manifest.gtplSourceHash,
        runData.startedAt,
      ]);
    for (const id of runData.engines)
      for (const sample of runData.samples[id]) {
        if (sample.result.memoryStatus) {
          const info = sample.result.memoryStatus;
          push(id, sample, "memory.status", info.state, "estado", info.phase);
          push(id, sample, "memory.reason", info.message, "texto", info.phase);
        }
        for (const metric of selectedMetrics(runData.config.method, true))
          push(
            id,
            sample,
            metric.key,
            Number.isFinite(sample.result.metrics[metric.key])
              ? numeric(sample.result.metrics[metric.key], metric)
              : null,
            metric.unit,
          );
        for (const snap of sample.result.snapshots ?? []) {
          push(
            id,
            sample,
            "environmentBytes",
            snap.memory?.totalBytes,
            "bytes",
            snap.phase,
          );
          push(
            id,
            sample,
            "exclusiveBytes",
            snap.memory?.exclusiveBytes,
            "bytes",
            snap.phase,
          );
          for (const [key, value] of Object.entries(snap.dom))
            push(id, sample, "dom." + key, value, "nodos", snap.phase);
        }
        for (const point of sample.result.grid ?? [])
          for (const [key, unit] of [
            ["fps", "fps"],
            ["frameP95Ms", "ms"],
            ["updateMs", "ms"],
            ["updatesPerSecond", "celdas/s"],
          ])
            push(id, sample, "grid." + key, point[key], unit, "", point);
      }
    content = data
      .map((row) =>
        row
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\r\n");
  }
  const url = URL.createObjectURL(
    new Blob([content], {
      type: format === "json" ? "application/json" : "text/csv;charset=utf-8",
    }),
  );
  const link = element("a");
  link.href = url;
  link.download = `gtpl-${runData.config.method}-${runData.engines.join("-")}.${format}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const query = new URLSearchParams(location.search);
if (query.get("method") in METHODS) $("#method").value = query.get("method");
for (const [id, key] of [
  ["cases", "cases"],
  ["size", "size"],
  ["samples", "samples"],
  ["engine-a", "engineA"],
  ["engine-b", "engineB"],
])
  if ([...$("#" + id).options].some((o) => o.value === query.get(key)))
    $("#" + id).value = query.get(key);
if (query.has("active"))
  $("#active-case").value = Number(query.get("active")) || 0;
$("#retention").checked = query.get("retention") === "true";
const memorySupported =
  crossOriginIsolated &&
  typeof performance.measureUserAgentSpecificMemory === "function";
$("#memory").disabled = !memorySupported;
$("#memory-mode").hidden = memorySupported;
$("#memory-mode").parentElement.hidden = crossOriginIsolated;
if (
  memorySupported &&
  new URLSearchParams(location.search).get("memory") === "1"
) {
  $("#memory").checked = true;
}
$("#memory-help").textContent = memorySupported
  ? "Modo de memoria activo: deltas del entorno JS+DOM en cada fase; puede tardar varios minutos. Incluye código y plantillas; no mide la RAM total de Chrome."
  : crossOriginIsolated
    ? "Aislamiento activo, pero este navegador no ofrece la API de memoria. Usa una versión compatible de Chrome o Edge."
    : "Abre el modo de memoria para habilitar esta API en Chrome o Edge compatibles, también en GitHub Pages.";
// Isolated pages supply an asset base; fragment links still target this page.
for (const link of document.querySelectorAll('a[href^="#"]'))
  link.href = new URL(link.getAttribute("href"), location.href).href;
$("#environment").textContent =
  `${navigator.userAgent} · ${navigator.hardwareConcurrency ?? "?"} hilos · ${innerWidth} × ${innerHeight} px · DPR ${devicePixelRatio} · aislamiento: ${crossOriginIsolated ? "sí" : "no"}`;
$("#run").addEventListener("click", start);
$("#stop").addEventListener("click", () => controller?.abort());
addEventListener("visibilitychange", () => {
  if (document.hidden && running) {
    $("#status").textContent =
      "La pestaña dejó de estar visible; deteniendo para evitar resultados sesgados.";
    controller.abort();
  }
});
addEventListener("resize", () => {
  if (running) {
    $("#status").textContent =
      "El tamaño del navegador cambió; deteniendo para mantener el mismo viewport.";
    controller.abort();
  }
});
new IntersectionObserver(
  () => {
    if (!running) return;
    const rect = $("#runner-slot").getBoundingClientRect();
    const visible = Math.max(
      0,
      Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0),
    );
    if (visible < rect.height / 2) {
      $("#status").textContent =
        "El ejecutor dejó de estar visible; muestra interrumpida.";
      controller.abort();
    }
  },
  { threshold: [0, 0.5, 1] },
).observe($("#runner-slot"));
$("#sample-metric").addEventListener("change", renderSamples);
$("#grid-metric").addEventListener("change", () =>
  renderGridCharts({ runData, engines, pair: pair() }),
);
$("#export-json").addEventListener("click", () => download("json"));
$("#export-csv").addEventListener("click", () => download("csv"));
for (const control of controls)
  control.addEventListener("change", () => {
    if (running) return;
    runData = null;
    $("#export-json").disabled = $("#export-csv").disabled = true;
    $("#result-context").textContent =
      "Configuración actualizada. Ejecuta una comparación para medirla.";
    $("#progress").value = 0;
    renderPair();
  });
renderPair();
try {
  const responses = await Promise.all(
    ["manifest.json"].map((file) => fetch(`benchmarks/${file}`)),
  );
  if (responses.some((response) => !response.ok))
    throw new Error("No se han podido cargar los bundles del experimento.");
  [manifest] = await Promise.all(responses.map((response) => response.json()));
  $("#engine-state").textContent = "Motores locales · versiones fijadas";
  renderPair();
} catch (error) {
  $("#status").textContent =
    location.protocol === "file:"
      ? "Abre esta página mediante HTTP: node scripts/benchmarks/serve.mjs"
      : error.message;
  $("#status").classList.add("error-text");
  $("#engine-state").textContent = "No se pudo iniciar";
}
