// Presentation only. Raw samples, units and measurement boundaries never change.
// No ratios for zero/negative/missing values, signed memory deltas or counts.
export function efficiencyScore(value, values, direction = "lower") {
  if (!["lower", "higher"].includes(direction) || !Number.isFinite(value) || value <= 0) return null;
  const valid = values.filter(v => Number.isFinite(v) && v > 0);
  if (!valid.length) return null;
  const best = direction === "lower" ? Math.min(...valid) : Math.max(...valid);
  return Math.min(100, 100 * (direction === "lower" ? best / value : value / best));
}
