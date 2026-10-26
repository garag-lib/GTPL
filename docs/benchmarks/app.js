import { examples } from "./examples.js";
import { metrics, summarize, comparison } from "./stats.js";
import { gridSizes } from "./grid-workload.js";
import { renderGridCharts } from "./grid-charts.js";

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
  vue: { name: "Vue", note: "Plantilla precompilada · v-if + v-for" },
  alpine: { name: "Alpine", note: "Directivas HTML · x-if + x-for" },
  angular: { name: "Angular", note: "AOT · @switch + @for · sin Zone.js" },
  vanilla: {
    name: "JavaScript directo",
    note: "Referencia manual · sin runtime de framework",
  },
};
const number = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });
let manifest,
  templates,
  runData,
  running = false,
  controller;
const controls = [...document.querySelectorAll(".arena select, .arena input")];
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
  const chartKeys = [
    "mountMs",
    "updateMs",
    "switchFirstMs",
    "switchRevisitMs",
    "fps",
    "memoryBytes",
    "frameP95Ms",
    "memoryMountedBytes",
    "memoryGrowthBytes",
  ];
  for (const metric of metrics.filter((metric) =>
    chartKeys.includes(metric.key),
  )) {
    const card = element("article", undefined, "chart-card");
    const header = element("header");
    header.append(
      element("h3", metric.title),
      element(
        "span",
        metric.direction === "lower"
          ? "↓ MENOS"
          : metric.direction === "higher"
            ? "↑ MÁS"
            : "EXPERIMENTAL",
        "direction",
      ),
    );
    card.append(header, element("p", metric.note, "chart-note"));
    const av = stats(a, metric.key),
      bv = stats(b, metric.key);
    const max = Math.max(Math.abs(av?.median ?? 0), Math.abs(bv?.median ?? 0));
    bar(
      card,
      engines[a].name,
      av?.median ?? null,
      max,
      metric,
      false,
      !runData,
    );
    bar(card, engines[b].name, bv?.median ?? null, max, metric, true, !runData);
    const footer = element("div", undefined, "metric-footer");
    if (metric.direction === "none") {
      if (runData && !runData.config.scenarios.some((s) => s !== "grid"))
        footer.textContent = "La memoria se mide en las pruebas de ramas.";
      else if (!memorySupported)
        footer.textContent =
          "Activa el modo de memoria en un navegador compatible.";
      else if (!runData) footer.textContent = "Pendiente de medición";
      else if (!runData.config.memory)
        footer.textContent = "Medición de memoria desactivada";
      else if (
        metric.needsSwitch &&
        !runData.config.scenarios.includes("switch")
      )
        footer.textContent = "Selecciona también el escenario Switch lazy.";
      else
        footer.textContent =
          av || bv
            ? "Experimental · valores firmados · sin clasificación"
            : "N/D: memoria no atribuida por el navegador.";
    } else if (!runData) footer.textContent = "Pendiente de medición";
    else if (!runData.config.scenarios.includes(metric.scenario))
      footer.textContent = "Escenario no seleccionado";
    else {
      const verdict = comparison(av, bv, metric);
      footer.textContent = verdict.winner
        ? `${engines[verdict.winner === "a" ? a : b].name}: ${metric.direction === "higher" ? `${number.format(verdict.ratio)}× la cadencia` : `${number.format((1 - 1 / verdict.ratio) * 100)}% menos tiempo`}${verdict.overlap ? " · rangos solapados" : " · en estas muestras"}`
        : verdict.text;
      if (metric.key === "fps" && av && bv) {
        const idleA = stats(a, "refreshMs"),
          idleB = stats(b, "refreshMs");
        if (
          idleA &&
          idleB &&
          (Math.max(idleA.median, idleB.median) > 50 ||
            Math.max(idleA.median, idleB.median) /
              Math.min(idleA.median, idleB.median) >
              1.15)
        ) {
          footer.textContent =
            "Cadencia en reposo limitada o distinta. Repite la prueba.";
        }
        if (
          [a, b].some((id) =>
            runData.samples[id].some(
              (sample) => sample.result.raw.frameIntervals.length < 12,
            ),
          )
        ) {
          footer.textContent =
            "Menos de 12 frames por muestra; cociente omitido.";
        }
      }
    }
    card.append(footer);
    $("#charts").append(card);
  }
  $("#table-a").textContent = engines[a].name;
  $("#table-b").textContent = engines[b].name;
  $("#result-table").replaceChildren();
  for (const metric of metrics) {
    const row = element("tr");
    const heading = element("th", metric.title);
    heading.scope = "row";
    row.append(heading);
    for (const id of [a, b]) {
      const summary = stats(id, metric.key);
      const cell = element(
        "td",
        summary ? formatted(summary.median, metric) : "N/D",
      );
      if (summary)
        cell.append(
          element(
            "small",
            `p95 ${formatted(summary.p95, metric)} · rango ${formatted(summary.min, metric)} – ${formatted(summary.max, metric)} · n=${summary.n}`,
          ),
        );
      row.append(cell);
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
    title.textContent = "Elige un rival. Deja hablar al navegador.";
    description.textContent =
      "Sin una puntuación global: ganar en montaje no implica ganar en fluidez o consumo.";
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
        : "Medianas de esta ejecución. Diferencias pequeñas o rangos solapados necesitan más muestras; no implican una ventaja general.";
}

function renderSamples() {
  const container = $("#samples-chart");
  container.replaceChildren();
  const [a, b] = pair(),
    metric = getMetric($("#sample-metric").value);
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
  const [a, b] = pair();
  for (const [side, id] of [
    ["a", a],
    ["b", b],
  ]) {
    const info = manifest?.frameworks[id];
    $(`#engine-${side}-meta`).textContent =
      `${info?.version ?? ""} · ${engines[id].note}`;
    $(`#code-${side}-title`).textContent = engines[id].name;
    $(`#code-${side}`).textContent = examples[id].code;
    $(`#code-${side}-note`).textContent = examples[id].note;
    $(`#code-${side}-lines`).textContent =
      `${examples[id].code.split("\n").filter((line) => line.trim()).length} líneas no vacías · ejemplo`;
  }
  $("#bundle-chart").replaceChildren();
  if (manifest) {
    const metric = { unit: "KiB gzip" };
    const max = Math.max(
      ...[a, b].map((id) => manifest.frameworks[id].gzipBytes / 1024),
    );
    for (const [index, id] of [a, b].entries())
      bar(
        $("#bundle-chart"),
        engines[id].name,
        manifest.frameworks[id].gzipBytes / 1024,
        max,
        metric,
        !!index,
      );
  }
  const links = $("#source-links");
  links.replaceChildren();
  for (const id of [a, b]) {
    const link = element("a", `${engines[id].name} · bundle ejecutado ↗`);
    link.href = `benchmarks/vendor/${id}.js`;
    links.append(link);
  }
  const build = element("a", "Build y adaptadores legibles ↗");
  build.href =
    "https://github.com/garag-lib/GTPL/blob/main/scripts/benchmarks/build.mjs";
  links.append(build);
  const sourceId = (id) => (id === "gtpl-jit" ? "gtpl" : id);
  $("#actual-template").textContent = [a, b]
    .map(
      (id) =>
        `${engines[id].name}\n${templates?.[sourceId(id)] ?? "Render mediante funciones JavaScript. Consulta el adaptador en build.mjs."}`,
    )
    .join("\n\n");
  if (!running) $("#run").disabled = !manifest || a === b;
  $("#run-hint").textContent =
    a === b
      ? "Elige dos motores o modos diferentes."
      : "Las pruebas se ejecutan al pulsar. Mantén esta pestaña en primer plano.";
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
function execute(id, config, signal) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    const token = crypto.randomUUID();
    iframe.title = `Benchmark real de ${engines[id].name}`;
    iframe.src = `benchmarks/runner.html?engine=${id}&token=${token}${config.mode === "grid" ? "&mode=grid" : ""}`;
    const cleanup = () => {
      clearTimeout(timeout);
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
      if (event.data.type === "error") finish(new Error(event.data.error));
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
  const scenarios = [
    ...document.querySelectorAll("[name=scenario]:checked"),
  ].map((input) => input.value);
  if (!scenarios.length) {
    $("#status").textContent = "Selecciona al menos un escenario.";
    return;
  }
  if (document.hidden) {
    $("#status").textContent = "Activa esta pestaña para comenzar.";
    return;
  }
  const config = {
    size: Number($("#size").value),
    count: Number($("#samples").value),
    scenarios,
    memory: $("#memory").checked,
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
    schema: 1,
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
        "exclusive URL-attributed delta; shared/unattributed memory excluded; GC uncontrolled",
    },
    samples: { [a]: [], [b]: [] },
    errors: [],
    order: [],
    cancelled: false,
  };
  controller = new AbortController();
  setRunning(true);
  $("#progress").value = 0;
  $("#progress").max = config.count * 2;
  $("#result-context").textContent =
    `${number.format(config.size)} filas × 12 ramas · ${config.count} muestras / motor · ${config.memory ? "memoria experimental activada" : "memoria desactivada"} · ${new Date().toLocaleString("es-ES")}`;
  $("#live-stage").scrollIntoView({ behavior: "instant", block: "center" });
  const rect = $("#runner-slot").getBoundingClientRect();
  runData.environment.runnerViewport = {
    width: rect.width,
    height: rect.height,
  };
  let done = 0;
  const failed = new Set();
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
          const classicScenarios = config.scenarios.filter((s) => s !== "grid");
          const result = classicScenarios.length
            ? await execute(
                id,
                { ...config, scenarios: classicScenarios },
                controller.signal,
              )
            : {
                metrics: Object.fromEntries(metrics.map((m) => [m.key, null])),
                raw: { frameIntervals: [] },
                validated: true,
              };
          if (config.scenarios.includes("grid")) {
            $("#status").textContent =
              `${engines[id].name} · grid creciente · muestra ${round + 1}/${config.count}`;
            const gridResult = await execute(
              id,
              { ...config, mode: "grid", scenarios: ["grid"], memory: false },
              controller.signal,
            );
            if (
              !gridResult.validated ||
              gridResult.grid.length !== config.grid.levels ||
              gridResult.grid.some(
                (point) =>
                  !point.validated ||
                  !Number.isFinite(point.fps) ||
                  point.frames < 1,
              )
            )
              throw new Error("Grid no validado.");
            result.grid = gridResult.grid;
          }
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
      "round",
      "rows",
      "metric",
      "value",
      "unit",
      "source_hash",
      "started_at",
      "grid_columns",
      "grid_rows",
      "grid_cells",
    ];
    const rows = [columns];
    for (const id of runData.engines)
      for (const sample of runData.samples[id])
        for (const metric of metrics)
          rows.push([
            id,
            manifest.frameworks[id].version,
            sample.round + 1,
            runData.config.size,
            metric.key,
            Number.isFinite(sample.result.metrics[metric.key])
              ? numeric(sample.result.metrics[metric.key], metric)
              : "",
            metric.unit,
            manifest.gtplSourceHash,
            runData.startedAt,
            "",
            "",
            "",
          ]);
    for (const id of runData.engines)
      for (const sample of runData.samples[id])
        for (const point of sample.result.grid ?? [])
          for (const [key, unit] of [
            ["fps", "fps"],
            ["frameP95Ms", "ms"],
            ["updateMs", "ms"],
            ["updatesPerSecond", "celdas/s"],
            ["generationMs", "ms"],
          ])
            rows.push([
              id,
              manifest.frameworks[id].version,
              sample.round + 1,
              "",
              `grid.${key}`,
              point[key],
              unit,
              manifest.gtplSourceHash,
              runData.startedAt,
              point.columns,
              point.rows,
              point.cells,
            ]);
    content = rows
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
  link.download = `gtpl-vs-${runData.engines.join("-")}-${runData.startedAt.replaceAll(":", "-")}.${format}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

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
  $("#samples").value = "3";
}
$("#memory-help").textContent = memorySupported
  ? "Modo de memoria activo. Mide la vista montada y el cambio tras revisitas. Puede añadir un minuto por muestra; excluye memoria compartida y RAM del proceso."
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
    $("#grid-config").hidden = !document.querySelector(
      "[name=scenario][value=grid]",
    ).checked;
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
    ["manifest.json", "templates.json"].map((file) =>
      fetch(`benchmarks/${file}`),
    ),
  );
  if (responses.some((response) => !response.ok))
    throw new Error("No se han podido cargar los bundles del experimento.");
  [manifest, templates] = await Promise.all(
    responses.map((response) => response.json()),
  );
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
