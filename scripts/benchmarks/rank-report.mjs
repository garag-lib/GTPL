import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const input = path.resolve(root, process.argv[2] || 'artifacts/general-ranking/results.json');
const destination = path.resolve(root, process.argv[3] || 'docs/benchmarks');
const record = JSON.parse(await readFile(input, 'utf8'));
if (!record.completedAt || record.errors.length) throw Error('A complete, validated run without discarded errors is required');
const confirmation = process.argv[4] ? JSON.parse(await readFile(path.resolve(root, process.argv[4]), 'utf8')) : record.gridConfirmation ?? null;
if (confirmation && (!confirmation.completedAt || confirmation.errors.length || confirmation.manifest.gtplSourceHash !== record.manifest.gtplSourceHash || JSON.stringify(confirmation.runnerHashes)!==JSON.stringify(record.runnerHashes)))
  throw Error('Grid confirmation is incomplete or uses different measured sources');
const engines = record.protocol.engines;
const labels = { gtpl: 'GTPL AOT', 'gtpl-jit': 'GTPL JIT', react: 'React', svelte: 'Svelte', vue: 'Vue', angular: 'Angular', alpine: 'Alpine', vanilla: 'JavaScript directo' };
const families = {
  'for-500': { title: 'Lista de 500 filas', operations: ['updateMs', 'appendMs', 'removeMs', 'reverseMs', 'replaceMs'] },
  if: { title: 'Condicional, 128 bloques', operations: ['showMs', 'hideMs', 'revisitMs'] },
  styles: { title: 'Estilos, 500 elementos', operations: ['updateMs'] },
  classes: { title: 'Clases, 500 elementos', operations: ['updateMs'] },
  attributes: { title: 'Atributos/texto, 500 elementos', operations: ['updateMs'] },
  forms: { title: 'Formulario, 500 campos', operations: ['inputMs'] },
};
const median = values => {
  const sorted = values.filter(Number.isFinite).sort((a,b)=>a-b), mid = sorted.length >> 1;
  if (!sorted.length) return null;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
};
const geo = values => Math.exp(values.reduce((sum, value) => {
  if (!(value > 0)) throw Error('Nonpositive latency: cannot construct a geometric ratio');
  return sum + Math.log(value);
}, 0) / values.length);
const sampleCache = new Map();
const rows = (phase, name, engine) => {
  const key = `${phase}/${name}/${engine}`;
  if (!sampleCache.has(key)) sampleCache.set(key, record.results.filter(row => row.phase === phase && row.case === name && row.engine === engine).sort((a,b)=>a.sample-b.sample));
  return sampleCache.get(key);
};
const stats = values => ({ median: median(values), min: Math.min(...values), max: Math.max(...values), n: values.length });
const metric = (name, engine, key, indices) => {
  let samples = rows('timing', name, engine);
  if (samples.length !== record.protocol.samples) throw Error(`Incomplete timing ${name}/${engine}`);
  const values = samples.map(row => row.result.metrics[key]);
  return median(indices ? indices.map(index => values[index]) : values);
};
function indexes(engine, draws = {}) {
  const mounts = [], updates = [], cases = {};
  for (const [name, spec] of Object.entries(families)) {
    const ratio = key => metric(name, engine, key, draws[name]) / metric(name, 'vanilla', key, draws[name]);
    const mount = ratio('mountMs'), update = geo(spec.operations.map(ratio));
    mounts.push(mount); updates.push(update);
    cases[name] = { mount, update, combined: Math.sqrt(mount * update) };
  }
  const mount = geo(mounts), update = geo(updates);
  return { mount, update, combined: Math.sqrt(mount * update), cases };
}
const scores = Object.fromEntries(engines.map(engine => [engine, indexes(engine)]));
// Paired-by-round bootstrap. The same draw is applied to every engine per case.
let seed = 20261028;
const random = () => { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed / 2**32; };
const distributions = Object.fromEntries(engines.map(engine => [engine, []]));
const repetitions = 2000;
for (let repeat=0;repeat<repetitions;repeat++) {
  const draws = Object.fromEntries(Object.keys(families).map(name => [name, Array.from({length:record.protocol.samples}, () => Math.floor(random()*record.protocol.samples))]));
  for (const engine of engines) distributions[engine].push(indexes(engine, draws).combined);
}
const percentile = (values, p) => [...values].sort((a,b)=>a-b)[Math.floor((values.length-1)*p)];
const order = [...engines].sort((a,b)=>scores[a].combined-scores[b].combined);
const production = order.filter(engine => !['vanilla','gtpl-jit'].includes(engine));
for (const engine of engines) scores[engine].interval95 = [percentile(distributions[engine], .025), percentile(distributions[engine], .975)];
const timing = Object.fromEntries(record.protocol.configs.filter(config => config.method!=='grid').map(config => [config.id, Object.fromEntries(engines.map(engine => [engine, Object.fromEntries(Object.keys(rows('timing',config.id,engine)[0].result.metrics).filter(key=>Number.isFinite(rows('timing',config.id,engine)[0].result.metrics[key])).map(key=>[key,stats(rows('timing',config.id,engine).map(row=>row.result.metrics[key]))]))]))]));
const heap = Object.fromEntries(record.protocol.configs.filter(config => ['switch','for','if'].includes(config.method)).map(config => [config.id, Object.fromEntries(engines.map(engine => {
  const samples = rows('heap',config.id,engine);
  if (samples.length!==record.protocol.heapSamples) throw Error(`Incomplete heap ${config.id}/${engine}`);
  return [engine, {
    ...Object.fromEntries(['definitionBytes','activeBytes','activationBytes','retainedBytes'].map(key=>[key,stats(samples.map(row=>row.result.metrics[key]).filter(Number.isFinite))])),
    inertElements: median(samples.map(row=>row.result.metrics.inertElements).filter(Number.isFinite)),
    activeElements: median(samples.map(row=>row.result.metrics.activeElements)),
  }];
}))]));
function gridSummary(dataset) {
const grid = {};
for (const config of dataset.protocol.configs.filter(config=>config.method==='grid')) {
  for (const engine of engines) {
    const samples = dataset.results.filter(row=>row.phase==='timing'&&row.case===config.id&&row.engine===engine).sort((a,b)=>a.sample-b.sample);
    if(samples.length!==dataset.protocol.samples)throw Error(`Incomplete grid ${config.id}/${engine}`);
    for (let level=0;level<samples[0].result.grid.length;level++) {
      const points=samples.map(row=>row.result.grid[level]), first=points[0];
      const key=`${first.columns}x${first.rows}-${first.percent}`;
      (grid[key]??={})[engine]={
        ...Object.fromEntries(['updateMs','dispatchMs','applyMs','layoutMs','fps','frameP95Ms','updatesPerSecond','frames'].map(key=>[key,stats(points.map(point=>point[key]))])),
        minimumFrames:Math.min(...points.map(point=>point.frames)),
      };
    }
  }
}
return grid;
}
const grid=gridSummary(record), confirmedGrid=confirmation?gridSummary(confirmation):null;
const summary = { definition:record.protocol.latencyIndex, baseline:'vanilla = 1', order, productionOrder:production, scores, timing, grid, confirmedGrid, heap, bootstrap:{ repetitions, seed:20261028, method:'paired by round within each case; percentile 95%; exploratory with only five observations per engine/case' } };
const n=(value,digits=2)=>Number.isFinite(value)?value.toFixed(digits):'N/D';
const mib=value=>Number.isFinite(value)?n(value/1024**2,3):'N/D';
const span=value=>`${n(value.median,3)} [${n(value.min,3)}–${n(value.max,3)}]`;
const table=(headers,data)=>`| ${headers.join(' | ')} |\n|${headers.map(()=> '---').join('|')}|\n${data.map(row=>'| '+row.join(' | ')+' |').join('\n')}\n`;
const lines=[
'# GTPL frente a los demás: medición general',
'',
`Tanda: ${record.startedAt} → ${record.completedAt}. Revisión medida: \`${record.revision}\`.`,
`Chrome ${record.environment.browser}, ${record.environment.cpu}, ${record.environment.cores} cores; viewport 960×190, DPR 1. ${record.results.length} muestras válidas, ${record.errors.length} fallos.`,
...(confirmation ? [`Confirmación independiente del grid: ${confirmation.results.length} muestras válidas, ${confirmation.errors.length} fallos. Total: ${record.results.length + confirmation.results.length}.`] : []),
'',
'## Puesto de latencia',
'',
'Índice descriptivo de estos seis casos DOM, no una clasificación universal de bibliotecas. JavaScript directo = 1; menor es mejor. Cada caso pesa 1/6. Dentro de cada caso, montaje y operaciones pesan 1/2 cada uno; las operaciones de lista y condicional se reparten su mitad por igual. Se usa la media geométrica de cocientes entre medianas. Descarga/importación no se cronometran; la compilación JIT durante mount sí. Memoria, FPS y switch no se mezclan en este índice.',
'',
table(['Puesto entre 8 modos','Motor/modo','Índice latencia','Montaje','Operaciones','IC bootstrap 95%'],order.map((engine,index)=>[index+1,labels[engine],n(scores[engine].combined),n(scores[engine].mount),n(scores[engine].update),scores[engine].interval95.map(value=>n(value)).join('–')])),
`Entre los seis frameworks en su modo de producción, excluyendo JavaScript directo y la variante GTPL JIT, GTPL AOT queda **${production.indexOf('gtpl')+1}.º de ${production.length}**.`,
'',
'Los intervalos son exploratorios (2.000 remuestreos emparejados por ronda, n=5); intervalos superpuestos y diferencias pequeñas no justifican un ganador estadístico. No se eliminan muestras lentas. Todas deben pasar validación completa de salida y limpieza.',
'',
'## Por caso',
'',
'Posiciones por índice combinado del caso; operaciones = media geométrica de las operaciones declaradas, normalizadas frente a JavaScript directo. Valores relativos, no milisegundos.',
'',
table(['Caso','GTPL AOT: puesto/8','GTPL JIT: puesto/8','Mejor framework de producción','GTPL AOT montaje','GTPL AOT operaciones'],Object.entries(families).map(([name,spec])=>{
 const ordered=[...engines].sort((a,b)=>scores[a].cases[name].combined-scores[b].cases[name].combined);
 return [spec.title,ordered.indexOf('gtpl')+1,ordered.indexOf('gtpl-jit')+1,labels[ordered.find(engine=>!['vanilla','gtpl-jit'].includes(engine))],n(scores.gtpl.cases[name].mount),n(scores.gtpl.cases[name].update)];
})),
'',
'### Medianas absolutas de operaciones (ms)',
'',
table(['Caso / operación',...engines.map(engine=>labels[engine])],Object.entries(families).flatMap(([name,spec])=>['mountMs',...spec.operations].map(key=>[`${name} / ${key}`,...engines.map(engine=>n(timing[name][engine][key].median,3))]))),
'',
'## Grid: pruebas de estrés separadas',
'',
'Misma granularidad que los adaptadores publicados. Cada muestra empieza con calentamiento de 4×4, usa semilla 42 y mide todas las celdas modificadas, más layout. Animación solicitada de 1,5 s por nivel; una operación larga puede excederla. Los FPS están limitados por rAF/pantalla. Menos de 12 frames en una muestra implica una cadencia insuficientemente estable; la cifra sigue registrada, no se convierte en un ganador de FPS.',
'',
table(['Grid / %','GTPL AOT update (ms)','Puesto GTPL AOT /8','Mejor update','GTPL AOT FPS','Mín. frames GTPL AOT'],Object.entries(grid).map(([key,values])=>{
 const ordered=[...engines].sort((a,b)=>values[a].updateMs.median-values[b].updateMs.median);
 return [key,n(values.gtpl.updateMs.median,3),ordered.indexOf('gtpl')+1,labels[ordered[0]],n(values.gtpl.fps.median),values.gtpl.minimumFrames];
})),
'',
...Object.entries(grid).flatMap(([key,values])=>[
`### ${key}`, '', table(['Motor','Update ms [mín–máx]','FPS [mín–máx]','Frames mínimos'],engines.map(engine=>[labels[engine],span(values[engine].updateMs),span(values[engine].fps),values[engine].minimumFrames])),''
]),
...(confirmedGrid ? [
'### Confirmación más larga del grid de 64×64 al 100 %',
'',
'La tanda inicial produjo menos de 12 frames por muestra en este estrés. Se repite en una tanda separada de cinco segundos, tres páginas nuevas por motor, con los mismos bundles y validaciones. Se usa semilla 45, igual a la semilla base 42 + nivel 3 del barrido inicial. No se mezclan estas observaciones con las de 1,5 segundos ni con el índice de latencia. Los contadores indican si siguen existiendo pocas observaciones.',
'',
...Object.entries(confirmedGrid).flatMap(([key,values])=>[table(['Motor','Update ms [mín–máx]','FPS [mín–máx]','Frames mínimos'],engines.map(engine=>[labels[engine],span(values[engine].updateMs),span(values[engine].fps),values[engine].minimumFrames])),'']),
] : []),
'## Heap JavaScript y DOM, separados de los tiempos',
'',
'Tres muestras por motor/caso, en páginas nuevas. La llamada a readMemory se sustituye únicamente en un módulo virtual del servidor por HeapProfiler.collectGarbage + Runtime.getHeapUsage de CDP. No se modifica ningún archivo del runner publicado ni los adaptadores. Se usa exclusivamente el contador usedSize: no se agregan los otros contadores CDP, que también quedan registrados. El dato es heap V8, excluye memoria DOM nativa, GPU y RSS; NO es measureUserAgentSpecificMemory ni RAM total, y no se interpreta como la residencia completa del código o las plantillas. Los tiempos de esta tanda no entran en el índice. Se registra el hash del módulo original y del instrumento. Se informa de cómo cambia usedSize tras importar las definiciones y montar la vista. Los nodos inertes se cuentan aparte.',
'',
...Object.entries(heap).flatMap(([key,values])=>[
`### ${key}`, '', table(['Motor','Heap definiciones Δ MiB','Heap activo Δ MiB','Activación Δ MiB','Retención tras ocultar Δ MiB','Elementos activos','Elementos inertes'],engines.map(engine=>[labels[engine],mib(values[engine].definitionBytes.median),mib(values[engine].activeBytes.median),mib(values[engine].activationBytes.median),mib(values[engine].retainedBytes.median),values[engine].activeElements,values[engine].inertElements??'—'])),''
]),
'## Reproducción y datos',
'',
'```sh',
'PLAYWRIGHT_MODULE=/ruta/playwright/index.mjs SAMPLES=5 HEAP_SAMPLES=3 \\',
'  node scripts/benchmarks/rank.mjs',
'node scripts/benchmarks/rank-report.mjs',
'```',
'',
...(confirmation ? [
'Confirmación de la cadencia:',
'',
'```sh',
'PLAYWRIGHT_MODULE=/ruta/playwright/index.mjs SAMPLES=3 HEAP_SAMPLES=0 \\',
'  GRID_START=64 GRID_LEVELS=1 GRID_SEED=45 GRID_DURATION_MS=5000 CASES=grid-64-64-100 \\',
'  RESULTS=artifacts/general-ranking/grid-confirmation.json node scripts/benchmarks/rank.mjs',
'node scripts/benchmarks/rank-report.mjs artifacts/general-ranking/results.json docs/benchmarks artifacts/general-ranking/grid-confirmation.json',
'```',
'',
] : []),
'Los bundles deben corresponder al manifest; el ejecutor comprueba todos sus hashes antes de arrancar. Se alterna el orden de motores y casos. Una sola página/contexto está activa a la vez, sin compilaciones ni pruebas en paralelo. Cada resultado conserva muestras, operaciones, frames, validación, configuración, versiones, hashes y carga del sistema.',
'',
'La clasificación solo describe estos adaptadores, cargas, navegador y equipo. No mide red, pintura explícita, UX completa, SSR, tamaño mínimo de una aplicación ni otras arquitecturas de estado. El ancho/alto del runner es fijo para todos. GTPL y Vue/Svelte/React/Angular/Alpine conservan sus patrones nativos; una lista indexada y una lista con claves no son algoritmos idénticos.',
'',
'[Datos completos y resumen numérico](general-results.json).',
];
await mkdir(destination,{recursive:true});
const measurementScripts = {};
for (const dataset of [record, confirmation].filter(Boolean)) {
  let source = dataset.measurementScriptSource;
  if (!source) {
    for (const candidate of ['rank-timing.mjs','rank-grid-confirmation.mjs'].map(name=>path.join(path.dirname(input),name)).concat(path.join(root,'scripts/benchmarks/rank.mjs'))) {
      const possible = await readFile(candidate,'utf8').catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
      if(possible && createHash('sha256').update(possible).digest('hex')===dataset.scriptSHA256) { source=possible; break; }
    }
  }
  if(!source || createHash('sha256').update(source).digest('hex')!==dataset.scriptSHA256)throw Error('Executed script snapshot does not match its recorded hash');
  measurementScripts[dataset.scriptSHA256]=source;
  dataset.measurementScriptSource=source;
}
const output={...record,summary,gridConfirmation:confirmation,measurementScripts};
await writeFile(path.join(destination,'general-results.json'),JSON.stringify(output,null,2)+'\n');
await writeFile(path.join(destination,'general-performance.md'),lines.join('\n')+'\n');
console.log(JSON.stringify({ productionOrder:production, leaderboard:order.map(engine=>({engine,...scores[engine]})), grid:Object.fromEntries(Object.entries(grid).map(([key,values])=>[key,values.gtpl.updateMs])), results:record.results.length,sha256:createHash('sha256').update(await readFile(input)).digest('hex')},null,2));
