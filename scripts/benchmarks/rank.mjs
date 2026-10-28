// Sequential, reproducible comparison of the published adapters and real runners.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const docs = path.join(root, 'docs');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engines = (process.env.ENGINES || 'gtpl,gtpl-jit,react,svelte,vue,angular,alpine,vanilla').split(',');
const samples = Number(process.env.SAMPLES || 5);
const heapSamples = Number(process.env.HEAP_SAMPLES ?? 3);
const durationMs = Number(process.env.GRID_DURATION_MS || 1500);
const gridStart = Number(process.env.GRID_START || 16);
const gridLevels = Number(process.env.GRID_LEVELS || 4);
const gridSeed = Number(process.env.GRID_SEED || 42);
const selected = process.env.CASES?.split(',');
const output = path.resolve(root, process.env.RESULTS || 'artifacts/general-ranking/results.json');
const sha = value => createHash('sha256').update(value).digest('hex');
const manifest = JSON.parse(await readFile(path.join(docs, 'benchmarks/manifest.json'), 'utf8'));
const referenced = new Map();
function inspect(value) {
  if (!value || typeof value !== 'object') return;
  if (value.file && value.sha256) referenced.set(value.file, value.sha256);
  for (const child of Object.values(value)) inspect(child);
}
inspect(manifest);
for (const [file, expected] of referenced)
  if (sha(await readFile(path.join(docs, file))) !== expected) throw Error(`Stale bundle: ${file}`);
const runnerFiles = ['runner.html', 'runner.js', 'method-runner.js', 'grid-runner.js', 'grid-workload.js', 'memory.js', 'method.css', 'grid.css', 'i18n.js', 'method-catalog.js'];
const runnerHashes = Object.fromEntries(await Promise.all(runnerFiles.map(async name => [name, sha(await readFile(path.join(docs, 'benchmarks', name)))])));
const source = await readFile(path.join(docs, 'benchmarks/method-runner.js'), 'utf8');
const hook = 'memory = await readMemory();';
if (source.split(hook).length !== 2) throw Error('Heap instrumentation seam changed');
const heapSource = source.replace(hook, 'memory = await globalThis.__benchmarkHeapRead();')
  .replace('environment deltas (JS + DOM), parent held stable; GC uncontrolled', 'CDP V8 JavaScript heap delta after forced GC; native DOM memory excluded');
const configs = [
  ...[8, 32, 64].map(cases => ({ id: `switch-${cases}`, method: 'switch', cases })),
  { id: 'for-500', method: 'for' }, { id: 'if', method: 'if' },
  ...['styles', 'classes', 'attributes', 'forms'].map(method => ({ id: method, method })),
  { id: `grid-${gridStart}-${gridStart + 16 * (gridLevels - 1)}-100`, method: 'grid', grid: { columns: gridStart, rows: gridStart, step: 16, levels: gridLevels, percent: 100, durationMs, seed: gridSeed } },
  { id: 'grid-64-10', method: 'grid', grid: { columns: 64, rows: 64, step: 1, levels: 1, percent: 10, durationMs, seed: 42 } },
].filter(config => !selected || selected.includes(config.id));
const heapConfigs = configs.filter(config => ['switch', 'for', 'if'].includes(config.method));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(docs, '.' + pathname);
    if (!file.startsWith(docs + path.sep)) throw Error('Invalid path');
    const data = pathname === '/benchmarks/__heap-method-runner.js' ? heapSource : await readFile(file);
    response.writeHead(200, {
      'Content-Type': (types[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8',
      'Cache-Control': 'no-store', 'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin',
    });
    response.end(data);
  } catch { response.writeHead(404); response.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] });
const measurementScriptSource = await readFile(fileURLToPath(import.meta.url), 'utf8');
const record = {
  schema: 1, startedAt: new Date().toISOString(), revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  environment: { browser: browser.version(), node: process.version, cpu: os.cpus()[0].model, cores: os.cpus().length, memoryBytes: os.totalmem(), viewport: { width: 960, height: 190 }, deviceScaleFactor: 1 },
  protocol: {
    samples, heapSamples, engines, configs, order: 'case order rotated by round; engine order rotated by case/round and reversed on odd rounds; one page/context at a time',
    timing: 'Unmodified published runMethod/runGrid; fresh page per engine/sample; download and module evaluation excluded, GTPL JIT compilation inside mount included; DOM completion, validation and forced layout are the common fence.',
    heap: 'Separate pass. The sole readMemory call is replaced in a virtual module with CDP HeapProfiler.collectGarbage + Runtime.getHeapUsage. usedSize covers V8 JavaScript heap, not native DOM/RSS. Timings from the heap pass are not ranked. Published files are unchanged.',
    heapHook: { originalSHA256: sha(source), instrumentedSHA256: sha(heapSource), replacement: hook + ' -> memory = await globalThis.__benchmarkHeapRead();' },
    fixtures: `500 rows/elements; if and each switch branch have 128 blocks; switch variants 8/32/64; grid from ${gridStart}, ${gridLevels} levels, step 16 at 100%, base seed ${gridSeed} + level; 64 at 10%, seed 42.`,
    latencyIndex: 'Six equally weighted DOM cases: for-500, if, styles, classes, attributes, forms. Within each case, mount and operations each have weight 1/2. List operations (update/append/remove/reverse/replace) and conditional operations (show/hide/revisit) are equally weighted within their half. Geometric mean of each median divided by the corresponding vanilla median. Switch memory and grid stress/FPS are reported separately, never mixed into this latency index.',
  },
  scriptSHA256: sha(measurementScriptSource), measurementScriptSource,
  manifest, runnerHashes, results: [], errors: [],
};
await mkdir(path.dirname(output), { recursive: true });
async function checkpoint() { await writeFile(output, JSON.stringify(record, null, 2) + '\n'); }
const total = configs.length * engines.length * samples + heapConfigs.length * engines.length * heapSamples;
let done = 0;
async function deadline(promise, ms) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error(`Sample exceeded ${ms} ms`)), ms);
    })]);
  } finally { clearTimeout(timer); }
}
async function run(config, engine, sample, phase) {
  const context = await browser.newContext({ viewport: record.environment.viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(120_000);
  const start = Date.now();
  try {
    if (phase === 'heap') {
      const cdp = await context.newCDPSession(page);
      await page.exposeFunction('__benchmarkHeapRead', async () => {
        await cdp.send('HeapProfiler.collectGarbage');
        const heap = await cdp.send('Runtime.getHeapUsage');
        const dom = await cdp.send('Memory.getDOMCounters');
        return { totalBytes: heap.usedSize, exclusiveBytes: null, status: 'measured', provider: 'CDP V8 heap after forced GC', heap, dom };
      });
    }
    await page.goto(origin + '/benchmarks/runner.html?lang=en');
    const result = await deadline(page.evaluate(async ({ config, engine, phase }) => {
      const host = document.querySelector('#app'), status = document.querySelector('#runner-status');
      const settings = { size: 500, cases: 32, activeCase: 0, retention: false, language: 'en', ...config, memory: phase === 'heap' };
      let result;
      if (config.method === 'grid') {
        const { runGrid } = await import('./grid-runner.js');
        const { createAdapter } = await import(`./vendor/grid-${engine}.js`);
        result = await runGrid(settings, createAdapter, host, status);
      } else {
        const { runMethod } = await import(phase === 'heap' ? './__heap-method-runner.js' : './method-runner.js');
        result = await runMethod(settings, engine, host, status);
      }
      if (!result.validated || host.childNodes.length !== 0) throw Error('Invalid output or incomplete cleanup');
      if (result.grid && !result.grid.every(point => point.validated)) throw Error('Invalid grid output');
      if (phase === 'heap' && !['definitionBytes', 'activeBytes', 'activationBytes'].every(key => Number.isFinite(result.metrics[key])))
        throw Error('Missing heap measurements');
      return result;
    }, { config, engine, phase }), 120_000);
    record.results.push({ phase, case: config.id, engine, sample, elapsedMs: Date.now() - start, load: os.loadavg(), result });
    console.log(`${++done}/${total} ${phase} ${config.id} ${engine} #${sample + 1} OK (${Date.now() - start} ms)`);
  } catch (error) {
    record.errors.push({ phase, case: config.id, engine, sample, message: error.message, elapsedMs: Date.now() - start });
    console.log(`${++done}/${total} ${phase} ${config.id} ${engine} #${sample + 1} FAIL: ${error.message.split('\n')[0]}`);
  } finally { await context.close(); await checkpoint(); }
}
try {
  console.log(`BEGIN ${total} samples; ${browser.version()}; ${record.environment.cpu}; output ${output}`);
  for (const [phase, count, cases] of [['timing', samples, configs], ['heap', heapSamples, heapConfigs]]) {
    for (let sample = 0; sample < count; sample++) {
      const orderedCases = [...cases.slice(sample % cases.length), ...cases.slice(0, sample % cases.length)];
      for (const [caseIndex, config] of orderedCases.entries()) {
        const offset = (sample * 3 + caseIndex) % engines.length;
        const order = [...engines.slice(offset), ...engines.slice(0, offset)];
        if (sample % 2) order.reverse();
        for (const engine of order) await run(config, engine, sample, phase);
      }
    }
  }
  record.completedAt = new Date().toISOString();
  await checkpoint();
  console.log(`DONE ${record.results.length} valid, ${record.errors.length} errors`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
if (record.errors.length) process.exitCode = 1;
