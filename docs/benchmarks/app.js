import "./navigation.js";
import { t, getLanguage, formatNumber, setLanguage, translateDOM, onLanguageChange, localizedError, errorMessage } from "./i18n.js";
import { renderMemoryProgress } from "./memory-progress.js";
import {
  createSampleExecutor,
  SAMPLE_TIMEOUT,
  sampleTimeoutMs,
} from "./sample-executor.js";
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
// Keep translated transient states available when the user changes language.
const textViews = new Map();
let runnerFinished = false;
function write(selector, render) {
  textViews.set(selector, render);
  $(selector).textContent = render();
}
const engines = {
  gtpl: { name: "GTPL AOT", get note() { return t("Precompiled template · direct DOM", "Plantilla precompilada · DOM directo"); } },
  "gtpl-jit": {
    name: "GTPL JIT",
    get note() { return t("Template compilation included in mounting", "Compilación de plantilla incluida en el montaje"); },
  },
  react: {
    name: "React",
    get note() { return t("Production · rendering committed with flushSync", "Producción · render confirmado con flushSync"); },
  },
  svelte: {
    name: "Svelte",
    get note() { return t("AOT · runes · DOM committed with flushSync", "AOT · runes · DOM confirmado con flushSync"); },
  },
  vue: { name: "Vue", get note() { return t("Precompiled template · native directives", "Plantilla precompilada · directivas nativas"); } },
  alpine: {
    name: "Alpine",
    get note() { return t("HTML directives · interpreted during mounting", "Directivas HTML · interpretación al montar"); },
  },
  angular: { name: "Angular", get note() { return t("AOT · without Zone.js", "AOT · sin Zone.js"); } },
  vanilla: {
    get name() { return t("Direct JavaScript", "JavaScript directo"); },
    get note() { return t("Manual reference · no framework runtime", "Referencia manual · sin runtime de framework"); },
  },
  flutter: {
    name: "Flutter Web",
    get note() { return t("Grid only · Dart release · CanvasKit · waits for Flutter frame", "Solo grid · Dart release · CanvasKit · espera al frame de Flutter"); },
  },
};
const number = { format: (value) => formatNumber(value, { maximumFractionDigits: 2 }) };
let manifest,
  runData,
  running = false,
  controller;
const controls = [...document.querySelectorAll(".arena select, .arena input")].filter(control => control.id !== "language");
const method = () => $("#method").value;
const pair = () => [$("#engine-a").value, $("#engine-b").value];
const numeric = (value, metric) =>
  metric.unit === "MiB" ? value / 1024 ** 2 : value;
const formatted = (value, metric) =>
  Number.isFinite(value)
    ? `${number.format(numeric(value, metric))} ${metric.unit}`
    : t("N/A", "N/D");
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
      value === null ? (pending ? "—" : t("N/A", "N/D")) : formatted(value, metric),
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
            ? t("DOM · VERIFIED", "DOM · VERIFICADO")
            : metric.direction === "higher"
              ? t("↑ HIGHER", "↑ MÁS")
              : t("↓ LOWER", "↓ MENOS"),
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
        ? t("Pending · enable memory to measure MiB", "Pendiente · activa memoria para medir MiB")
        : !runData.config.memory
          ? t("Memory disabled; DOM is still verified.", "Memoria desactivada; el DOM sí se verifica.")
          : runData.memoryWarnings.length
            ? av || bv
              ? t("Partial readings: API unresponsive; missing values shown as N/A.", "Lecturas parciales: API sin respuesta; faltantes como N/D.")
              : t("API unresponsive: RAM N/A; DOM and timings verified.", "API sin respuesta: RAM N/D; DOM y tiempos verificados.")
            : av || bv
              ? t("JS+DOM environment deltas · GC may affect readings", "Deltas del entorno JS+DOM · puede intervenir el GC")
              : running
                ? t("Measurement in progress; the runner shows its phase and wait time.", "Medición en curso; la fase y la espera aparecen en el ejecutor.")
                : t("API unavailable or reading failed.", "API no disponible o lectura fallida.");
    else if (metric.direction === "none")
      foot.textContent =
        av || bv
          ? t("Actual count; inert templates are counted separately.", "Recuento real; incluye plantillas inertes por separado.")
          : t("Pending measurement", "Pendiente de medición");
    else if (!runData) foot.textContent = t("Pending measurement", "Pendiente de medición");
    else {
      const verdict = comparison(av, bv, metric);
      foot.textContent = verdict.winner
        ? `${engines[verdict.winner === "a" ? a : b].name}: ${metric.direction === "higher" ? number.format(verdict.ratio) + t("× the frame rate", "× la cadencia") : number.format((1 - 1 / verdict.ratio) * 100) + t("% less time", "% menos tiempo")}${verdict.overlap ? t(" · overlapping ranges", " · rangos solapados") : ""}`
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
          foot.textContent = t("Too few observed frames; ratio omitted.", "Pocos frames observados; cociente omitido.");
        else if (
          cadenceA &&
          cadenceB &&
          Math.max(cadenceA, cadenceB) / Math.min(cadenceA, cadenceB) > 1.25
        )
          foot.textContent =
            t("Different idle frame rates; ratio omitted.", "Cadencias de reposo diferentes; cociente omitido.");
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
        td = element("td", stat ? formatted(stat.median, metric) : t("N/A", "N/D"));
      if (stat)
        td.append(
          element(
            "small",
            `p95 ${formatted(stat.p95, metric)} · ${t("range", "rango")} ${formatted(stat.min, metric)} – ${formatted(stat.max, metric)} · n=${stat.n}`,
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
    title.textContent = t("Choose two engines and a benchmark case.", "Elige dos motores y un caso programático.");
    description.textContent =
      t("Each pattern has its own goal: switch focuses on memory and view creation.", "Cada patrón tiene su objetivo: switch se centra en memoria y creación de vistas.");
    return;
  }
  const validA = runData.samples[a].length,
    validB = runData.samples[b].length;
  title.textContent = t(`${validA} / ${runData.config.count} samples from ${engines[a].name} · ${validB} / ${runData.config.count} from ${engines[b].name}`, `${validA} / ${runData.config.count} muestras de ${engines[a].name} · ${validB} / ${runData.config.count} de ${engines[b].name}`);
  description.textContent = running
    ? t("Comparison running. Each result is validated before being included.", "Comparación en curso. Cada resultado se valida antes de incorporarse.")
    : runData.errors.length
      ? t(`${runData.errors.length} sample(s) failed or were interrupted. Export JSON for details; failures are not converted to zeros.`, `Hay ${runData.errors.length} muestra(s) fallida(s) o interrumpida(s). Consulta el JSON para ver el detalle; no se convierten en ceros.`)
      : runData.cancelled
        ? t("Run stopped. Completed samples are preserved.", "Ejecución detenida. Se conservan las muestras completas.")
        : runData.memoryWarnings.length
          ? t("The memory API timed out. The comparison continued in fresh runners without memory readings; missing readings are N/A. Export JSON for details.", "La API de memoria superó el límite de espera. La comparación continuó en ejecutores nuevos sin memoria; las lecturas faltantes son N/D. Consulta el JSON para ver el detalle.")
          : t("Medians for the selected case. Code and templates remain in memory; counts distinguish the active view from inert content. GC may affect memory deltas.", "Medianas del caso elegido. Código y plantillas residen en memoria; los recuentos distinguen vista activa y contenido inerte. Los deltas de memoria pueden variar por el GC.");
}

function renderSamples() {
  const container = $("#samples-chart");
  container.replaceChildren();
  const [a, b] = pair(),
    metric = getMetric($("#sample-metric").value);
  if (!metric) {
    container.append(
      element("div", t("Select a metric for this case.", "Selecciona una métrica del caso."), "sample-empty"),
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
        t("Samples will appear here when you run this scenario.", "Las muestras aparecerán aquí al ejecutar este escenario."),
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
  title.textContent = t(`${metric.title} in ${metric.unit}, by round. Full values are available in the results table and JSON export.`, `${metric.title} en ${metric.unit}, por ronda. Los valores completos están en la tabla de resultados y la exportación JSON.`);
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
      tip.textContent = `${engines[index ? b : a].name} · ${t("round", "ronda")} ${sample.round + 1}: ${formatted(value, metric)}`;
      node.append(tip);
    }
  });
  container.append(svg);
  const legend = element("div", undefined, "sample-legend");
  legend.append(
    element("span", `${engines[a].name} · ${t("circle", "círculo")}`),
    element("span", `${engines[b].name} · ${t("square", "cuadrado")}`),
  );
  container.append(legend);
}

function renderPair() {
  for (const side of ["a", "b"]) {
    const select = $(`#engine-${side}`);
    const flutter = select.querySelector('option[value="flutter"]');
    flutter.hidden = flutter.disabled = method() !== "grid";
    if (select.value === "flutter" && method() !== "grid") select.value = side === "a" ? "gtpl" : "react";
  }
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
  $("#memory").disabled = running || !memorySupported || method() === "grid";
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
    const info = manifest?.gridFrameworks[id] ?? manifest?.frameworks[id];
    $(`#engine-${side}-meta`).textContent =
      `${info?.version ?? ""} · ${engines[id].note}`;
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
  if (!running) $("#run").disabled = !manifest || a === b;
  write("#run-hint", () => a === b
      ? t("Choose two different engines or modes.", "Elige dos motores o modos diferentes.")
      : [a, b].includes("flutter")
        ? t("Flutter waits for its frame; DOM engines confirm DOM + layout. Update times have different boundaries; compare cadence with this distinction.", "Flutter espera a su frame; los motores DOM confirman DOM + layout. Los tiempos de actualización tienen límites distintos; tenlo en cuenta al comparar la cadencia.")
      : method() === "switch"
        ? t("Memory is the primary measure. Timings are secondary data.", "La memoria es la medida principal. Los tiempos quedan como datos secundarios.")
        : t("Keep the runner visible during measurement.", "Mantén el ejecutor visible mientras se mide."));
  const query = new URLSearchParams({
    method: method(),
    engineA: a,
    engineB: b,
    samples: $("#samples").value,
    cases: String(cases),
    size: $("#size").value,
    active: $("#active-case").value,
    retention: String($("#retention").checked),
    lang: getLanguage(),
  });
  $("#memory-mode").href = "benchmarks/isolated.html?" + query;
  if (memorySupported)
    write("#memory-help", () => method() === "grid"
        ? t("The grid does not measure memory.", "El grid no mide memoria.")
        : t(`${Number($("#samples").value) * 2 * memoryPhaseCount({ method: method(), retention: $("#retention").checked })} readings in total. Per-reading limit: ${MEMORY_TIMEOUT_MS / 1000} s. Each complete sample has ${sampleTimeoutMs({ memory: true, method: method(), retention: $("#retention").checked }) / 1000} s, including loading, rendering and all readings. The sample timer does not reset between phases. JS+DOM, not total Chrome RAM.`, `${Number($("#samples").value) * 2 * memoryPhaseCount({ method: method(), retention: $("#retention").checked })} lecturas en total. Límite por lectura: ${MEMORY_TIMEOUT_MS / 1000} s. La muestra completa dispone de ${sampleTimeoutMs({ memory: true, method: method(), retention: $("#retention").checked }) / 1000} s, incluyendo carga, renderizado y todas las lecturas. El contador de la muestra no se reinicia entre fases. JS+DOM, no RAM total de Chrome.`));
  renderCharts();
}
function setRunning(value) {
  running = value;
  if ($("#language")) $("#language").disabled = value;
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
    iframe.title = t(`Live benchmark for ${engines[id].name}`, `Benchmark real de ${engines[id].name}`);
    iframe.src = `benchmarks/runner.html?engine=${id}&token=${token}&mode=${config.mode === "grid" ? "grid" : "method"}&lang=${getLanguage()}`;
    let finished = false;
    const cleanup = () => {
      removeEventListener("message", receive);
      signal.removeEventListener("abort", abort);
      iframe.remove();
    };
    const finish = (error, result) => {
      if (finished) return;
      finished = true;
      cleanup();
      error ? reject(error) : resolve(result);
    };
    const abort = () =>
      finish(
        signal.reason ?? new DOMException(t("Run stopped.", "Ejecución detenida."), "AbortError"),
      );
    const receive = (event) => {
      if (
        event.source !== iframe.contentWindow ||
        event.origin !== location.origin ||
        event.data?.channel !== "gtpl-bench" ||
        event.data.token !== token
      )
        return;
      if (event.data.type === "ready") {
        onProgress?.({ kind: "sample", phase: t("running case", "ejecutando caso") });
        iframe.contentWindow.postMessage(
          { channel: "gtpl-bench", token, type: "run", config },
          location.origin,
        );
      }
      if (event.data.type === "result") finish(null, event.data.result);
      if (event.data.type === "progress") onProgress?.(event.data.progress);
      if (event.data.type === "error")
        finish(
          Object.assign(new Error(event.data.error), {
            code: event.data.code,
            translations: event.data.translations,
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
    write("#status", () => t("Activate this tab to start.", "Activa esta pestaña para comenzar."));
    return;
  }
  runnerFinished = false;
  const config = {
    language: getLanguage(),
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
      write("#status", () => errorMessage(error));
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
  write("#result-context", () => `${METHODS[method()].title} · ${method() === "switch" ? t(`${config.cases} branches × 128 blocks; selected ${config.activeCase}`, `${config.cases} ramas × 128 bloques; elegida ${config.activeCase}`) : method() === "if" ? t("128 blocks", "128 bloques") : method() === "grid" ? t("X/Y growth", "crecimiento X/Y") : t(`${config.size} items`, `${config.size} elementos`)} · ${t(`${config.count} samples/engine`, `${config.count} muestras/motor`)} · ${t("memory", "memoria")} ${config.memory ? t("enabled", "activa") : t("disabled", "desactivada")}`);
  $("#live-stage").scrollIntoView({ behavior: "instant", block: "center" });
  const rect = $("#runner-slot").getBoundingClientRect();
  runData.environment.runnerViewport = {
    width: rect.width,
    height: rect.height,
  };
  let done = 0;
  const failed = new Set();
  const executeSample = createSampleExecutor(
    createMemoryExecutor(execute, (warning) =>
      runData.memoryWarnings.push({ ...warning, round: Math.floor(done / 2) }),
    ),
  );
  renderCharts();
  try {
    for (let round = 0; round < config.count; round++) {
      const order = (round + first) % 2 ? [b, a] : [a, b];
      for (const id of order) {
        if (controller.signal.aborted)
          throw new DOMException(t("Run stopped.", "Ejecución detenida."), "AbortError");
        runData.order.push({ round, engine: id });
        write("#live-engine", () => `${engines[id].name} · ${t("round", "ronda")} ${round + 1}/${config.count}`);
        write("#status", () => t(`${engines[id].name} · sample ${round + 1} of ${config.count}${config.memory ? " · the memory API may take some time" : ""}`, `${engines[id].name} · muestra ${round + 1} de ${config.count}${config.memory ? " · la API de memoria puede tardar" : ""}`));
        try {
          if (failed.has(id))
            throw localizedError("Engine skipped after an earlier failure in this run.", "Motor omitido tras un fallo anterior en esta ejecución.");
          const result = await executeSample(
            id,
            { ...config, mode: method() === "grid" ? "grid" : "method" },
            controller.signal,
            (progress) => {
              const prefix = t(`${engines[id].name} · sample ${round + 1} of ${config.count}`, `${engines[id].name} · muestra ${round + 1} de ${config.count}`);
              renderMemoryProgress(
                {
                  status: $("#status"),
                  live: $("#live-engine"),
                  bar: $("#progress"),
                  completed: done,
                },
                prefix,
                progress,
              );
            },
          );
          if (
            !result.validated ||
            Object.values(result.metrics).some(
              (value) => value !== null && !Number.isFinite(value),
            )
          )
            throw localizedError("Invalid result.", "Resultado inválido.");
          runData.samples[id].push({ round, result });
        } catch (error) {
          runData.errors.push({
            engine: id,
            round,
            message: error.message,
            code: error.code,
            phase: error.phase,
            timeoutMs: error.timeoutMs,
            elapsedMs: error.elapsedMs,
          });
          if (error.name === "AbortError") throw error;
          // A cold import or a delayed browser operation can exhaust one sample
          // without making the engine invalid for every subsequent round.
          if (error.code !== SAMPLE_TIMEOUT) failed.add(id);
        }
        done++;
        $("#progress").value = done;
        renderCharts();
      }
    }
    const errors = runData.errors.length;
    write("#status", () => errors
      ? t(`Finished with ${errors} failed sample(s). Export JSON for details.`, `Finalizado con ${errors} muestra(s) fallida(s). Exporta el JSON para ver el detalle.`)
      : runData.memoryWarnings.length
        ? t("Comparison completed and validated. The memory API did not respond; missing readings are N/A.", "Comparación terminada y validada. La API de memoria no respondió; lecturas faltantes como N/D.")
        : t("Comparison completed. All samples were validated.", "Comparación terminada. Todas las muestras se han validado."));
  } catch (error) {
    runData.cancelled = true;
    write("#status", () => error.name === "AbortError"
        ? t("Run stopped. Valid samples are preserved.", "Ejecución detenida. Se conservan las muestras válidas.")
        : errorMessage(error));
  } finally {
    runData.finishedAt = new Date().toISOString();
    runnerFinished = true;
    $("#progress").value = done;
    $("#progress").setAttribute("aria-valuetext", $("#status").textContent);
    $("#runner-slot").replaceChildren(
      element(
        "div",
        t("Run finished · completed samples preserved", "Ejecución finalizada · muestras completas conservadas"),
        "sample-empty",
      ),
    );
    write("#live-engine", () => t("Runner released", "Ejecutor liberado"));
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
        (manifest.gridFrameworks[id] ?? manifest.frameworks[id]).version,
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
          push(id, sample, "memory.status", info.state, t("state", "estado"), info.phase);
          push(id, sample, "memory.reason", info.message, t("text", "texto"), info.phase);
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
            push(id, sample, "dom." + key, value, t("nodes", "nodos"), snap.phase);
        }
        for (const point of sample.result.grid ?? [])
          for (const [key, unit] of [
            ["fps", "fps"],
            ["frameP95Ms", "ms"],
            ["updateMs", "ms"],
            ["dispatchMs", "ms"],
            ["applyMs", "ms"],
            ["layoutMs", "ms"],
            ["updatesPerSecond", t("cells/s", "celdas/s")],
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
write("#memory-help", () => memorySupported
  ? t("Memory mode enabled: JS+DOM environment deltas at each phase; this can take several minutes. Includes code and templates; does not measure total Chrome RAM.", "Modo de memoria activo: deltas del entorno JS+DOM en cada fase; puede tardar varios minutos. Incluye código y plantillas; no mide la RAM total de Chrome.")
  : crossOriginIsolated
    ? t("Isolation enabled, but this browser does not expose the memory API. Use a supported Chrome or Edge version.", "Aislamiento activo, pero este navegador no ofrece la API de memoria. Usa una versión compatible de Chrome o Edge.")
    : t("Open memory mode to enable this API in supported Chrome or Edge versions, including on GitHub Pages.", "Abre el modo de memoria para habilitar esta API en Chrome o Edge compatibles, también en GitHub Pages."));
// Isolated pages supply an asset base; fragment links still target this page.
const fragmentLinks = [...document.querySelectorAll('a[href^="#"]')].map((link) => ({
  link,
  fragment: link.getAttribute("href"),
}));
function updateFragmentLinks() {
  for (const { link, fragment } of fragmentLinks)
    link.href = new URL(fragment, location.href).href;
}
updateFragmentLinks();
write("#environment", () => `${navigator.userAgent} · ${navigator.hardwareConcurrency ?? "?"} ${t("threads", "hilos")} · ${innerWidth} × ${innerHeight} px · DPR ${devicePixelRatio} · ${t("isolation", "aislamiento")}: ${crossOriginIsolated ? t("yes", "sí") : "no"}`);
$("#run").addEventListener("click", start);
$("#stop").addEventListener("click", () => controller?.abort());
addEventListener("visibilitychange", () => {
  if (document.hidden && running) {
    write("#status", () => t("The tab is no longer visible; stopping to avoid biased results.", "La pestaña dejó de estar visible; deteniendo para evitar resultados sesgados."));
    controller.abort();
  }
});
addEventListener("resize", () => {
  if (running) {
    write("#status", () => t("The browser size changed; stopping to preserve a consistent viewport.", "El tamaño del navegador cambió; deteniendo para mantener el mismo viewport."));
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
      write("#status", () => t("The runner is no longer visible; sample interrupted.", "El ejecutor dejó de estar visible; muestra interrumpida."));
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
    write("#result-context", () => t("Configuration updated. Run a comparison to measure it.", "Configuración actualizada. Ejecuta una comparación para medirla."));
    $("#progress").value = 0;
    renderPair();
  });
translateDOM();
for (const [selector, render] of textViews) $(selector).textContent = render();
const languageControl = $("#language");
if (languageControl) {
  languageControl.value = getLanguage();
  languageControl.addEventListener("change", () => setLanguage(languageControl.value));
}
onLanguageChange(() => {
  if (languageControl) languageControl.value = getLanguage();
  translateDOM();
  updateFragmentLinks();
  renderPair();
  for (const [selector, render] of textViews) $(selector).textContent = render();
  if (runnerFinished) {
    $("#runner-slot").replaceChildren(element("div", t("Run finished · completed samples preserved", "Ejecución finalizada · muestras completas conservadas"), "sample-empty"));
    $("#progress").setAttribute("aria-valuetext", $("#status").textContent);
  }
});
renderPair();
try {
  const responses = await Promise.all(
    ["manifest.json"].map((file) => fetch(`benchmarks/${file}`)),
  );
  if (responses.some((response) => !response.ok))
    throw localizedError("The experiment bundles could not be loaded.", "No se han podido cargar los bundles del experimento.");
  [manifest] = await Promise.all(responses.map((response) => response.json()));
  write("#engine-state", () => t("Local engines · pinned versions", "Motores locales · versiones fijadas"));
  renderPair();
} catch (error) {
  write("#status", () => location.protocol === "file:"
      ? t("Open this page over HTTP: node scripts/benchmarks/serve.mjs", "Abre esta página mediante HTTP: node scripts/benchmarks/serve.mjs")
      : errorMessage(error));
  $("#status").classList.add("error-text");
  write("#engine-state", () => t("Could not start", "No se pudo iniciar"));
}
