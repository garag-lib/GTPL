// Compare two source trees with the same prepared AOT adapters and method runner.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
if (!process.env.BASELINE_ROOT) throw Error('BASELINE_ROOT must be a prepared reference checkout');
const baseline = path.resolve(process.env.BASELINE_ROOT);
const out = path.resolve(process.env.OUTPUT || 'artifacts/update-implementation');
const docs = path.join(baseline, 'docs');
const samples = Number(process.env.SAMPLES || 7);
const methods = ['for', 'attributes'];
await mkdir(out, { recursive: true });
const sha = value => createHash('sha256').update(value).digest('hex');
const bundles = {}, runtime = {};
for (const variant of ['baseline', 'candidate']) {
  bundles[variant] = {};
  const tree = variant === 'baseline' ? baseline : root;
  for (const method of methods) {
    const result = await build({ entryPoints: [path.join(baseline, `scripts/benchmarks/node_modules/.gtpl-build/method-${method}-gtpl.js`)],
      bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, write: false,
      plugins: [{ name: 'selected-source-tree', setup(b) {
        b.onLoad({ filter: /\.ts$/ }, async args => {
          const sourceRoot = path.join(baseline, 'src') + path.sep;
          if (!args.path.startsWith(sourceRoot)) return;
          const source = path.join(tree, 'src', path.relative(sourceRoot, args.path));
          return { contents: await readFile(source, 'utf8'), loader: 'ts', resolveDir: path.dirname(source) };
        });
      } }] });
    bundles[variant][method] = result.outputFiles[0].text;
    await writeFile(path.join(out, `${method}-${variant}.js`), result.outputFiles[0].text);
  }
  const result = await build({ entryPoints: [path.join(tree, 'src/lib/gtpl.ts')], bundle: true,
    format: 'iife', globalName: 'lib', platform: 'browser', target: 'es2022', minify: true, write: false });
  runtime[variant] = result.outputFiles[0].text;
}
let variant = 'baseline';
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const method = /^\/benchmarks\/methods\/(for|attributes)-gtpl\.js$/.exec(pathname)?.[1];
    const file = path.resolve(docs, '.' + pathname);
    if (!file.startsWith(docs + path.sep)) throw Error('Invalid path');
    const data = method ? bundles[variant][method] : await readFile(file);
    res.writeHead(200, { 'Content-Type': ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] });
const report = { samples, startedAt: new Date().toISOString(), browser: browser.version(),
  protocol: 'Alternating paired fresh contexts. Original prepared AOT generator and unmodified method runner. Both source trees bundled as standalone minified ESM. Separate partial-list diagnostic measures JavaScript completion, excluding layout; validates all labels and watcher counts.',
  sourceHashes: Object.fromEntries(await Promise.all(['baseline', 'candidate'].map(async variant => [variant,
    sha(await readFile(path.join(variant === 'baseline' ? baseline : root, 'src/GTpl.ts')))]))),
  proxyHashes: Object.fromEntries(await Promise.all(['baseline', 'candidate'].map(async variant => [variant,
    sha(await readFile(path.join(variant === 'baseline' ? baseline : root, 'src/GProxy.ts')))]))),
  runnerSHA256: sha(await readFile(path.join(docs, 'benchmarks/method-runner.js'))),
  bundleHashes: Object.fromEntries(Object.entries(bundles).map(([v, entries]) => [v, Object.fromEntries(Object.entries(entries).map(([m, code]) => [m, sha(code)]))])),
  results: [], partialLists: [] };
const checkpoint = () => writeFile(path.join(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
try {
  for (let sample = 0; sample < samples; sample++) {
    const order = sample % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate'];
    for (const method of sample % 2 ? [...methods].reverse() : methods) {
      for (const v of order) {
        variant = v;
        const context = await browser.newContext({ viewport: { width: 960, height: 190 }, deviceScaleFactor: 1 });
        try {
          const page = await context.newPage();
          await page.goto(`http://127.0.0.1:${server.address().port}/benchmarks/runner.html?lang=en`);
          const result = await page.evaluate(async method => {
            const { runMethod } = await import('./method-runner.js');
            const host = document.querySelector('#app');
            const result = await runMethod({ method, size: 500, cases: 32, activeCase: 0, retention: false, language: 'en', memory: false }, 'gtpl', host, document.querySelector('#runner-status'));
            if (!result.validated || host.childNodes.length) throw Error('Invalid output or cleanup');
            return result;
          }, method);
          report.results.push({ sample, method, variant, result });
          await checkpoint(); console.log(sample, method, variant, 'OK');
        } finally { await context.close(); }
      }
    }
    for (const variant of order) {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        await page.addScriptTag({ content: runtime[variant] });
        const records = await page.evaluate(async () => {
          const { GTpl, jit: { GCodeOptimized, GCompile } } = lib.default;
          const generator = GCompile(GCodeOptimized('<div><span g-for="rows;i;row">{{row.label}}</span></div>', { methodAliases: true }));
          const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
          const records = [];
          for (const size of [1000, 10000]) {
            const makeRows = () => Array.from({ length: size }, (_, i) => ({ label: String(i) }));
            const root = { rows: makeRows() };
            const host = document.createElement('div'); document.body.append(host);
            const app = new GTpl({ root, generator }); app.addTo(host); await app.ready();
            let events = 0; app.watch('rows', () => events++);
            for (const phase of ['afterMount', 'afterReplacement']) {
              if (phase === 'afterReplacement') { root.rows = makeRows(); await settle(); }
              for (const update of ['first', 'second']) {
                events = 0; const start = performance.now();
                root.rows[size - 1].label = phase + update; await settle();
                const ms = performance.now() - start;
                const nodes = host.querySelectorAll('span');
                if (events !== 1 || nodes.length !== size || [...nodes].some((node, i) => node.textContent !== (i === size - 1 ? phase + update : String(i)))) throw Error('Partial-list mismatch');
                records.push({ size, phase, update, ms, events });
              }
            }
            app.destroy(); if (host.childNodes.length) throw Error('Partial-list cleanup failed'); host.remove();
          }
          return records;
        });
        report.partialLists.push({ sample, variant, records });
        await checkpoint(); console.log(sample, 'partialLists', variant, 'OK');
      } finally { await context.close(); }
    }
  }
  report.completedAt = new Date().toISOString(); await checkpoint();
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
