import { createHash } from 'node:crypto';

// Excluding a contender must not change any retained source/compiler/bundle.
// Raw runs stay intact, with exclusions disclosed separately in the overview.
export function compareManifests(measured, current, allowGtplVersionChange = false, excludedEngines = []) {
  measured = structuredClone(measured);
  for (const manifest of [measured, current]) {
    for (const group of [manifest.frameworks, manifest.gridFrameworks, ...Object.values(manifest.methods ?? {})]) {
      for (const id of excludedEngines) {
        if (manifest === current && group?.[id]) throw Error(`Excluded engine is still published: ${id}`);
        if (manifest === measured && group) delete group[id];
      }
    }
  }
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

export function compareRunner(file, source, measuredHash, excludedEngines = []) {
  const sha = value => createHash('sha256').update(value).digest('hex');
  if (sha(source) === measuredHash) return 'exact';
  // The only permitted runner edit is removing this engine from its allow-list.
  // Reconstruct the old file and verify its full hash, including all timing code.
  if (file === 'runner.js' && excludedEngines.includes('vanilla') &&
      sha(source.replace('  "flutter",\n', '  "vanilla",\n  "flutter",\n')) === measuredHash)
    return 'engine-allow-list-only';
  throw Error(`Measured runner changed: ${file}`);
}
