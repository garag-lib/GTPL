import { t } from "./i18n.js";

export function summarize(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const n = sorted.length;
  if (!n) return null;
  const mid = Math.floor(n / 2);
  return {
    n,
    median: n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
    min: sorted[0],
    max: sorted[n - 1],
    p95: sorted[Math.ceil(n * 0.95) - 1],
  };
}

export const metrics = [
  {
    key: "mountMs",
    title: "Montaje inicial",
    unit: "ms",
    direction: "lower",
    note: "Primera rama y todas sus filas, con layout.",
    scenario: "mount",
  },
  {
    key: "updateMs",
    title: "Actualización de filas",
    unit: "ms",
    direction: "lower",
    note: "Mediana de 10 cambios del contador en todas las filas.",
    scenario: "update",
  },
  {
    key: "switchFirstMs",
    title: "Switch · primera visita",
    unit: "ms",
    direction: "lower",
    note: "Activar cada una de las 11 ramas aún sin visitar.",
    scenario: "switch",
  },
  {
    key: "switchRevisitMs",
    title: "Switch · revisita",
    unit: "ms",
    direction: "lower",
    note: "Volver a las 12 ramas tras haberlas visitado.",
    scenario: "switch",
  },
  {
    key: "fps",
    title: "Fluidez bajo carga",
    unit: "fps",
    direction: "higher",
    note: "Cadencia de rAF al actualizar filas. Limitada por la pantalla.",
    scenario: "frames",
  },
  {
    key: "memoryBytes",
    title: "Δ memoria atribuida",
    unit: "MiB",
    direction: "none",
    note: "Cambio de memoria exclusiva desde el calentamiento hasta el montaje. Experimental.",
    scenario: "memory",
  },
  {
    key: "frameP95Ms",
    title: "Intervalo de frame p95",
    unit: "ms",
    direction: "lower",
    note: "Percentil 95 de los intervalos de rAF.",
    scenario: "frames",
  },
  {
    key: "slowFrames",
    title: "Frames lentos",
    unit: "%",
    direction: "lower",
    note: "Intervalos superiores a 1,5× la cadencia en reposo.",
    scenario: "frames",
  },
  {
    key: "domNodes",
    title: "Nodos conectados al montar",
    unit: "nodos",
    direction: "none",
    note: "Elementos, textos y comentarios; no incluye el contenido inerte de templates.",
    scenario: "always",
  },
  {
    key: "refreshMs",
    title: "Intervalo de frame en reposo",
    unit: "ms",
    direction: "none",
    note: "Cadencia de rAF sin carga, antes de cada animación.",
    scenario: "frames",
  },
  {
    key: "memoryMountedBytes",
    title: "Memoria de la vista montada",
    unit: "MiB",
    direction: "none",
    note: "Memoria atribuida exclusivamente al ejecutor, incluido su runtime. No es la RAM total del proceso.",
    scenario: "memory",
  },
  {
    key: "memoryAfterSwitchBytes",
    title: "Memoria después del switch",
    unit: "MiB",
    direction: "none",
    note: "Memoria exclusiva después de 11 primeras visitas y 12 revisitas.",
    scenario: "memory",
    needsSwitch: true,
  },
  {
    key: "memoryGrowthBytes",
    title: "Δ memoria tras revisitas",
    unit: "MiB",
    direction: "none",
    note: "Cambio tras recorrer las 12 ramas dos veces. Incluye cachés y variación del GC; crecer no demuestra una fuga.",
    scenario: "memory",
    needsSwitch: true,
  },
];

export function comparison(a, b, metric) {
  if (!a || !b || a.n < 3 || b.n < 3 || metric.direction === "none")
    return { text: t("Three valid samples per engine are required.", "Se necesitan 3 muestras válidas por motor."), winner: null };
  if (a.median <= 0 || b.median <= 0)
    return { text: t("No stable ratio for zero values.", "Sin cociente estable para valores nulos."), winner: null };
  const ratio = a.median / b.median;
  if (Math.abs(ratio - 1) < 0.05)
    return { text: t("Medians differ by less than 5%.", "Medianas a menos de un 5% de distancia."), winner: null };
  const aWins = metric.direction === "higher" ? ratio > 1 : ratio < 1;
  return {
    winner: aWins ? "a" : "b",
    ratio: aWins === (metric.direction === "higher") ? ratio : 1 / ratio,
    overlap: a.max >= b.min && b.max >= a.min,
  };
}

const translations = {
  "Montaje inicial": "Initial mount",
  "Primera rama y todas sus filas, con layout.": "First branch and all its rows, including layout.",
  "Actualización de filas": "Row updates",
  "Mediana de 10 cambios del contador en todas las filas.": "Median of 10 counter changes across all rows.",
  "Switch · primera visita": "Switch · first visit",
  "Activar cada una de las 11 ramas aún sin visitar.": "Activate each of the 11 unvisited branches.",
  "Switch · revisita": "Switch · revisit",
  "Volver a las 12 ramas tras haberlas visitado.": "Return to all 12 branches after visiting them.",
  "Fluidez bajo carga": "Frame rate under load",
  "Cadencia de rAF al actualizar filas. Limitada por la pantalla.": "rAF cadence while updating rows. Limited by the display.",
  "Δ memoria atribuida": "Δ attributed memory",
  "Cambio de memoria exclusiva desde el calentamiento hasta el montaje. Experimental.": "Exclusive-memory change from warm-up to mount. Experimental.",
  "Intervalo de frame p95": "p95 frame interval",
  "Percentil 95 de los intervalos de rAF.": "95th percentile of rAF intervals.",
  "Frames lentos": "Slow frames",
  "Intervalos superiores a 1,5× la cadencia en reposo.": "Intervals exceeding 1.5× the idle cadence.",
  "Nodos conectados al montar": "Connected nodes at mount",
  "nodos": "nodes",
  "Elementos, textos y comentarios; no incluye el contenido inerte de templates.": "Elements, text nodes and comments; excludes inert template contents.",
  "Intervalo de frame en reposo": "Idle frame interval",
  "Cadencia de rAF sin carga, antes de cada animación.": "Unloaded rAF cadence before each animation.",
  "Memoria de la vista montada": "Mounted-view memory",
  "Memoria atribuida exclusivamente al ejecutor, incluido su runtime. No es la RAM total del proceso.": "Memory attributed exclusively to the runner, including its runtime. Not total process RAM.",
  "Memoria después del switch": "Memory after switching",
  "Memoria exclusiva después de 11 primeras visitas y 12 revisitas.": "Exclusive memory after 11 first visits and 12 revisits.",
  "Δ memoria tras revisitas": "Δ memory after revisits",
  "Cambio tras recorrer las 12 ramas dos veces. Incluye cachés y variación del GC; crecer no demuestra una fuga.": "Change after visiting all 12 branches twice. Includes caching and GC variation; growth does not prove a leak."
};
for (const record of metrics) {
  for (const key of ["title", "note", "unit"]) {
    const spanish = record[key];
    if (!(spanish in translations)) continue;
    Object.defineProperty(record, key, { enumerable: true, get: () => t(translations[spanish], spanish) });
  }
}
