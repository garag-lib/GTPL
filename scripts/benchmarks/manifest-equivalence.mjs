// A release can change the GTPL label without changing any measured byte.
// Keep raw samples intact; never accept source/compiler/bundle differences.
export function compareManifests(measured, current, allowGtplVersionChange = false) {
  if (JSON.stringify(measured) === JSON.stringify(current)) return 'exact';
  if (!allowGtplVersionChange) throw Error('Results and current bundles differ');
  const normalize = manifest => {
    const copy = structuredClone(manifest);
    for (const group of [copy.frameworks, copy.gridFrameworks, ...Object.values(copy.methods ?? {})])
      for (const id of ['gtpl', 'gtpl-jit'])
        if (group?.[id]) group[id].version = '<GTPL release label>';
    return JSON.stringify(copy);
  };
  if (normalize(measured) !== normalize(current)) throw Error('Measured source, compiler or assets changed; new measurements required');
  return 'gtpl-version-only';
}
