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
];

export function comparison(a, b, metric) {
  if (!a || !b || a.n < 3 || b.n < 3 || metric.direction === "none")
    return { text: "Se necesitan 3 muestras válidas por motor.", winner: null };
  if (a.median <= 0 || b.median <= 0)
    return { text: "Sin cociente estable para valores nulos.", winner: null };
  const ratio = a.median / b.median;
  if (Math.abs(ratio - 1) < 0.05)
    return { text: "Medianas a menos de un 5% de distancia.", winner: null };
  const aWins = metric.direction === "higher" ? ratio > 1 : ratio < 1;
  return {
    winner: aWins ? "a" : "b",
    ratio: aWins === (metric.direction === "higher") ? ratio : 1 / ratio,
    overlap: a.max >= b.min && b.max >= a.min,
  };
}
