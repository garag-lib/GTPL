import { localizedError } from "./i18n.js";

// Shared workload: independent cell state, reproducible sampling without
// replacement, and the same sequence prefix for every engine at each size.
export function gridSizes({ columns, rows, step, levels }) {
  if (
    ![columns, rows, step, levels].every(Number.isInteger) ||
    columns < 2 ||
    rows < 2 ||
    step < 1 ||
    levels < 1 ||
    levels > 6
  )
    throw localizedError("Invalid grid dimensions.", "Dimensiones del grid inválidas.");
  const sizes = Array.from({ length: levels }, (_, i) => ({
    columns: columns + i * step,
    rows: rows + i * step,
  }));
  if (
    sizes.some(
      (s) => s.columns > 128 || s.rows > 128 || s.columns * s.rows > 16384,
    )
  )
    throw localizedError("The final grid exceeds 128 × 128 cells. Reduce growth or levels.", "El último grid supera 128 × 128 celdas. Reduce el crecimiento o los niveles.");
  return sizes;
}

export function createGridWorkload(total, percent, seed) {
  if (!Number.isInteger(total) || total < 1 || ![10, 25, 100].includes(percent))
    throw localizedError("Invalid grid workload.", "Carga del grid inválida.");
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = state;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
  const count = Math.max(1, Math.ceil((total * percent) / 100));
  const order = Uint32Array.from({ length: total }, (_, i) => i);
  const expected = new Uint32Array(total);
  const indices = new Uint32Array(count),
    values = new Uint32Array(count);
  return {
    expected,
    count,
    next() {
      for (let i = 0; i < count; i++) {
        const j = i + Math.floor(random() * (total - i));
        [order[i], order[j]] = [order[j], order[i]];
        const index = order[i];
        let value = Math.floor(random() * 65536);
        if (value === expected[index]) value = (value + 1) & 65535;
        indices[i] = index;
        values[i] = value;
        expected[index] = value;
      }
      return { indices, values };
    },
  };
}

export function gridChecksum(values) {
  let hash = 2166136261;
  for (const value of values) hash = Math.imul(hash ^ value, 16777619) >>> 0;
  return hash;
}
