// npm build first, then rank.mjs, then this command with two raw result paths.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { overviewMetrics, engineNames, productionEngines } from '../../docs/benchmarks/overview-catalog.js';
import { summarize } from '../../docs/benchmarks/stats.js';
import { compareManifests } from './manifest-equivalence.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const [mainFile, flutterFile] = process.argv.slice(2);
if (!mainFile || !flutterFile) throw Error('Usage: node scripts/benchmarks/publish-results.mjs RAW.json FLUTTER.json');
const main = JSON.parse(await readFile(mainFile, 'utf8'));
const flutter = JSON.parse(await readFile(flutterFile, 'utf8'));
const manifest = JSON.parse(await readFile(path.join(root, 'docs/benchmarks/manifest.json'), 'utf8'));
const allowVersionChange = process.argv.includes('--allow-gtpl-version-change');
let equivalence = 'exact';
for (const run of [main, flutter]) {
  if (!run.completedAt || run.errors.length) throw Error('Incomplete or failed measurement; do not publish');
  const match = compareManifests(run.manifest, manifest, allowVersionChange);
  if (match !== 'exact') equivalence = match;
  if (run.results.some(s => !s.result.validated)) throw Error('Unvalidated output');
}
if (JSON.stringify(main.runnerHashes) !== JSON.stringify(flutter.runnerHashes)) throw Error('Runner changed between passes');
for (const [file, expected] of Object.entries(main.runnerHashes)) {
  const actual = createHash('sha256').update(await readFile(path.join(root, 'docs/benchmarks', file))).digest('hex');
  if (actual !== expected) throw Error(`Measured runner changed: ${file}`);
}
for (const config of flutter.protocol.configs) {
  const matching = main.protocol.configs.find(c => c.id === config.id);
  if (JSON.stringify(config) !== JSON.stringify(matching)) throw Error('Flutter and DOM workloads differ');
}
const all = [...main.results, ...flutter.results];
const metrics = overviewMetrics.map(def => {
  const values = Object.keys(engineNames).map(engine => {
    if (def.phase === 'bundle') {
      const entry = manifest.methods[def.test]?.[engine];
      return { engine, median: entry ? entry.gzipBytes / 1024 : null, n: entry ? 1 : 0 };
    }
    const samples = all.filter(s => s.engine === engine && s.phase === def.phase && (def.test === 'grid'
      ? s.result.grid && (s.result.grid[0].percent ?? s.result.workload?.percent ?? (s.case.endsWith('-10') ? 10 : 100)) === def.percent
      : s.case === def.test));
    const points = def.test === 'grid' ? samples.map(s => s.result.grid.find(p => p.cells === 4096)).filter(Boolean) : [];
    const readings = def.test === 'grid' ? points.map(p => p[def.key]) : samples.map(s => s.result.metrics[def.key]);
    const scale = def.unit === 'MiB' ? 1024 ** 2 : 1;
    const summary = summarize(readings.filter(v => Number.isFinite(v)).map(v => v / scale));
    return { engine, ...(summary ?? { median: null, n: 0 }), ...(points.length ? { minFrames: Math.min(...points.map(p => p.frames)) } : {}) };
  }).filter(row => row.n);
  return { id: def.id, values };
});
for (const {id, values} of metrics) {
  if (!values.length || values.some(v => !Number.isFinite(v.median))) throw Error(`Missing values: ${id}`);
  const expected = id.startsWith('grid-') ? 9 : 8;
  if (values.length !== expected) throw Error(`${id}: expected ${expected} engines, got ${values.length}`);
  const def = overviewMetrics.find(m => m.id === id);
  for (const row of values) {
    const run = row.engine === 'flutter' ? flutter : main;
    const count = def.phase === 'bundle' ? 1 : def.phase === 'heap' ? run.protocol.heapSamples : run.protocol.samples;
    if (row.n !== count) throw Error(`${id}/${row.engine}: expected ${count} samples, got ${row.n}`);
  }
}
const result = {
  schema: 1, measuredAt: main.completedAt, environment: main.environment,
  sourceHash: manifest.gtplSourceHash,
  equivalence,
  measuredVersions: Object.fromEntries(Object.keys(engineNames).map(id => [id, (main.manifest.gridFrameworks[id] ?? main.manifest.frameworks[id]).version])),
  manifestSHA256: createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),
  versions: Object.fromEntries(Object.keys(engineNames).map(id => [id, (manifest.gridFrameworks[id] ?? manifest.frameworks[id]).version])),
  samples: main.protocol.samples, heapSamples: main.protocol.heapSamples,
  validSamples: all.length, failedSamples: main.errors.length + flutter.errors.length,
  rawSHA256: createHash('sha256').update(await readFile(mainFile)).digest('hex'),
  flutterRawSHA256: createHash('sha256').update(await readFile(flutterFile)).digest('hex'),
  metrics,
};
const out = path.join(root, 'docs/benchmarks/results');
await mkdir(out, { recursive: true });
await copyFile(mainFile, path.join(out, 'raw.json'));
await copyFile(flutterFile, path.join(out, 'flutter-raw.json'));
await writeFile(path.join(out, 'latest.json'), JSON.stringify(result, null, 2) + '\n');
const num = value => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(value);
const report = [
  '# Comparación por aspectos', '',
  `Medición: ${result.measuredAt}. Chrome ${result.environment.browser} headless; ${result.environment.cpu}.`, '',
  `${result.validSamples} muestras validadas, ${result.failedSamples} errores. ${result.samples} muestras de tiempo y ${result.heapSamples} de memoria por motor/caso. Medianas; las diferencias con rangos solapados no demuestran una ventaja estable.`, '',
  'Puesto entre GTPL AOT, React, Svelte, Vue, Angular y Alpine. Vanilla y GTPL JIT aparecen en la tabla completa. Flutter se mide solo en grid, con su build original.', '',
  '| Aspecto | GTPL AOT | Puesto / 6 | Mejor mediana entre los seis | Rangos solapados con GTPL |',
  '| --- | ---: | ---: | --- | --- |',
];
for (const def of overviewMetrics) {
  const rows = metrics.find(m => m.id === def.id).values;
  const production = rows.filter(r => productionEngines.includes(r.engine)).sort((a, b) => def.direction === 'higher' ? b.median - a.median : a.median - b.median);
  const g = production.find(r => r.engine === 'gtpl'), best = production[0];
  const overlap = production.filter(r => r.engine !== 'gtpl' && r.min !== undefined && r.max >= g.min && r.min <= g.max).map(r => engineNames[r.engine]);
  report.push(`| ${def.title.es} | ${num(g.median)} ${def.unit} | ${production.indexOf(g) + 1} | ${engineNames[best.engine]} · ${num(best.median)} ${def.unit} | ${overlap.join(', ') || '—'} |`);
}
report.push('', '## Todas las medianas', '',
  `| Aspecto | ${Object.values(engineNames).join(' | ')} |`,
  `| --- | ${Object.keys(engineNames).map(() => '---:').join(' | ')} |`);
for (const def of overviewMetrics) {
  const rows = metrics.find(m => m.id === def.id).values;
  report.push(`| ${def.title.es} (${def.unit}) | ${Object.keys(engineNames).map(id => { const r = rows.find(r => r.engine === id); return r ? num(r.median) : '—'; }).join(' | ')} |`);
}
report.push('', '## Alcance', '',
  '- Ediciones locales: cambia texto y valor de 1 o 50 filas, preservando objetos no modificados. React usa filas inmutables y memo; los demás, su estado reactivo nativo.',
  '- Se conservan las pruebas con arrays nuevos: añadir también renueva los objetos existentes; quitar e invertir también cambian valores. No son mutaciones locales.',
  '- Tiempo: DOM confirmado y lectura de layout. Descarga/importación excluidas; la compilación JIT sí entra en el montaje. Validación completa fuera del reloj.',
  '- Memoria: delta de heap V8 tras GC, incluye código y objetos; excluye memoria nativa del DOM y RAM total. El HTML inerte de Alpine no queda representado completamente en este número.',
  '- Descarga: entrada y dependencias compartidas del caso en gzip, incluida su plantilla. No es tamaño mínimo de librería.',
  '- Grid: 5 s por nivel, mismas semillas/celdas/cambios. Flutter incluye espera al frame y envío del render; DOM termina tras cambios y layout, antes de pintar. No comparar estos tiempos como costes CPU equivalentes.',
  '- Las barras usan índices por prueba (100 = mejor). No se calcula una clasificación global.', '',
  '### Frames observados en grid 64 × 64', '',
  '| Motor | Mínimo de frames al 100 % | Mínimo al 10 % |', '| --- | ---: | ---: |');
for (const [id, name] of Object.entries(engineNames)) {
  const counts = ['grid-full', 'grid-tenth'].map(key => metrics.find(m => m.id === key).values.find(r => r.engine === id)?.minFrames);
  report.push(`| ${name} | ${counts.map(n => n < 12 ? `${n} (cadencia poco estable)` : n).join(' | ')} |`);
}
report.push('', `GTPL source SHA256: \`${result.sourceHash}\`.`, '',
  ...(equivalence === 'gtpl-version-only' ? [`GTPL figuraba como ${result.measuredVersions.gtpl} al medir. La versión ${result.versions.gtpl} conserva exactamente las mismas fuentes, opciones, ejecutores y bytes de los bundles medidos (SHA-256 verificados). Las muestras originales no se modifican.`, ''] : []),
  `Versiones: ${Object.entries(result.versions).map(([id, version]) => `${engineNames[id]} ${version}`).join('; ')}.`, '',
  '[Resumen y rangos](latest.json) · [Todas las muestras DOM](raw.json) · [Muestras Flutter](flutter-raw.json) · [Reproducir](../README.md)', '');
await writeFile(path.join(out, 'README.md'), report.join('\n'));
console.log(`Published ${metrics.length} comparisons, ${all.length} validated samples.`);
