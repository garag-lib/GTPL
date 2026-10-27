import { summarize } from "./stats.js";

export function renderGridCharts({ runData, engines, pair }) {
  const chart = document.querySelector("#grid-chart"),
    table = document.querySelector("#grid-table");
  const [a, b] = pair,
    key = document.querySelector("#grid-metric").value;
  const definitions = {
    fps: ["FPS", "fps"],
    frameP95Ms: ["Intervalo de frame p95", "ms"],
    updatesPerSecond: ["Actualizaciones por segundo", "celdas/s"],
    updateMs: ["Actualización + DOM + layout", "ms"],
  };
  const [title, unit] = definitions[key];
  const groups = [a, b].map((id) =>
    (runData?.samples[id] ?? []).filter((sample) => sample.result.grid?.length),
  );
  chart.replaceChildren();
  table.replaceChildren();
  const first = groups.flat()[0]?.result.grid;
  if (!first) {
    const empty = document.createElement("div");
    empty.className = "sample-empty";
    empty.textContent =
      "Selecciona «Grid creciente» y ejecuta una comparación para ver dónde cae la fluidez.";
    chart.append(empty);
    return;
  }
  const n = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }),
    short = new Intl.NumberFormat("es-ES", {
      notation: "compact",
      maximumFractionDigits: 1,
    });
  const summaries = groups.map((samples) =>
    first.map((point) => ({
      point,
      summary: summarize(
        samples.map(
          (sample) =>
            sample.result.grid.find((p) => p.cells === point.cells)?.[key],
        ),
      ),
    })),
  );
  const width = 920,
    height = 270,
    left = 70,
    right = 30,
    top = 22,
    bottom = 46;
  const max =
    Math.max(1, ...summaries.flat().map((p) => p.summary?.median ?? 0)) * 1.12;
  const minCells = first[0].cells,
    maxCells = first.at(-1).cells;
  const x = (cells) =>
    left +
    (maxCells === minCells ? 0.5 : (cells - minCells) / (maxCells - minCells)) *
      (width - left - right);
  const y = (value) =>
    height - bottom - (value / max) * (height - top - bottom);
  const ns = "http://www.w3.org/2000/svg",
    svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  const node = (tag, attrs, text) => {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (text !== undefined) el.textContent = text;
    svg.append(el);
    return el;
  };
  node(
    "title",
    {},
    `${title} frente a celdas totales. Medianas por nivel; consulta la tabla para los valores y las muestras.`,
  );
  for (let i = 0; i <= 4; i++) {
    const value = (max * i) / 4;
    node("line", {
      x1: left,
      x2: width - right,
      y1: y(value),
      y2: y(value),
      class: "gridline",
    });
    node(
      "text",
      { x: left - 10, y: y(value) + 4, "text-anchor": "end" },
      short.format(value),
    );
  }
  node("text", { x: left, y: 12 }, unit);
  for (const point of first)
    node(
      "text",
      { x: x(point.cells), y: height - 23, "text-anchor": "middle" },
      short.format(point.cells),
    );
  node(
    "text",
    { x: (left + width - right) / 2, y: height - 3, "text-anchor": "middle" },
    "Celdas totales (columnas × filas)",
  );
  summaries.forEach((points, index) => {
    const valid = points.filter((p) => p.summary);
    node("polyline", {
      points: valid
        .map((p) => `${x(p.point.cells)},${y(p.summary.median)}`)
        .join(" "),
      fill: "none",
      stroke: index ? "#7660ca" : "#26734b",
      "stroke-width": 2.5,
    });
    for (const p of valid) {
      const marker = node(
        index ? "rect" : "circle",
        index
          ? {
              x: x(p.point.cells) - 4,
              y: y(p.summary.median) - 4,
              width: 8,
              height: 8,
              fill: "#7660ca",
            }
          : {
              cx: x(p.point.cells),
              cy: y(p.summary.median),
              r: 4.5,
              fill: "#26734b",
            },
      );
      const tip = document.createElementNS(ns, "title");
      tip.textContent = `${engines[index ? b : a].name} · ${p.point.columns}×${p.point.rows}: ${n.format(p.summary.median)} ${unit} · n=${p.summary.n}`;
      marker.append(tip);
    }
  });
  chart.append(svg);
  const legend = document.createElement("div");
  legend.className = "sample-legend";
  for (const [index, id] of [a, b].entries()) {
    const span = document.createElement("span");
    span.textContent = `${engines[id].name} · ${index ? "cuadrado" : "círculo"} · ${groups[index].length} muestra(s)`;
    legend.append(span);
  }
  chart.append(legend);
  for (const point of first) {
    const tr = document.createElement("tr"),
      head = document.createElement("th");
    head.scope = "row";
    head.textContent = `${point.columns} × ${point.rows} · ${n.format(point.cells)} celdas`;
    tr.append(head);
    for (const [index, id] of [a, b].entries()) {
      const samples = groups[index]
        .map((s) => s.result.grid.find((p) => p.cells === point.cells))
        .filter(Boolean);
      const td = document.createElement("td");
      if (!samples.length) td.textContent = "N/D";
      else {
        const value = (k) =>
          n.format(summarize(samples.map((s) => s[k])).median);
        td.textContent = `${engines[id].name}: ${value("fps")} fps`;
        const detail = document.createElement("small");
        detail.textContent = `p95 ${value("frameP95Ms")} ms · ${value("updatesPerSecond")} celdas/s · n=${samples.length}`;
        td.append(detail);
        if (samples.some((s) => s.frames < 12)) {
          const warning = document.createElement("small");
          warning.textContent =
            "Menos de 12 frames en una muestra: cadencia poco estable.";
          td.append(warning);
        }
      }
      tr.append(td);
    }
    table.append(tr);
  }
}
