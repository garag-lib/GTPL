// Isolated experiments, using the project's unchanged method runner and AOT adapters.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const out = path.join(root, 'artifacts/update-analysis');
const docs = path.join(root, 'docs');
const bundles = {};
for (const variant of ['baseline', 'candidate']) {
  bundles[variant] = {};
  for (const method of ['for', 'attributes']) {
    const result = await build({ entryPoints: [path.join(root, `scripts/benchmarks/node_modules/.gtpl-build/method-${method}-gtpl.js`)],
      bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, write: false,
      define: { 'process.env.NODE_ENV': '"production"' },
      plugins: variant === 'candidate' ? [{ name: 'experiment', setup(b) {
        b.onLoad({ filter: /\/GTpl\.ts$/ }, async args => {
          const source = await readFile(args.path, 'utf8');
          const contents = method === 'for'
            ? source.replace('} else ordinary = isOrdinaryData(rows);', '} else ordinary = !!job.listUpdate && isOrdinaryData(rows);')
            : source.replace('for (let key in result) {', 'for (let key in toRaw(result)) {');
          if (contents === source) throw Error('Experiment anchor missing');
          return { contents, loader: 'ts', resolveDir: path.dirname(args.path) };
        });
      } }] : [] });
    bundles[variant][method] = result.outputFiles[0].text;
    await writeFile(path.join(out, `${method}-${variant}.js`), result.outputFiles[0].text);
  }
}
let variant = 'baseline';
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const method = /^\/benchmarks\/methods\/(for|attributes)-gtpl\.js$/.exec(pathname)?.[1];
    const file = path.resolve(docs, '.' + pathname);
    if (!file.startsWith(docs + path.sep)) throw Error('Invalid path');
    const data = method ? bundles[variant][method] : await readFile(file);
    res.writeHead(200, { 'Content-Type': ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] });
const report = { protocol: 'Seven alternating paired fresh pages per method; original method runner and AOT generator; standalone minified bundles for BOTH baseline and experiment, no profiler/counters. Candidate is one change per case. Source runtime unchanged.',
  hashes: Object.fromEntries(Object.entries(bundles).map(([v, methods]) => [v, Object.fromEntries(Object.entries(methods).map(([m, code]) => [m, createHash('sha256').update(code).digest('hex')]))])), results: [] };
try {
  const diagnostic = await browser.newPage();
  await diagnostic.addScriptTag({ path: path.join(out, 'plain.js') });
  report.inheritedDefinitions = await diagnostic.evaluate(async () => {
    const { GTpl, jit: { GCompile, GCode } } = lib.default;
    const state = { items: [{ id: 1 }], attrs: { title: 'A' }, tick: 0 };
    const app = new GTpl({ root: state, generator: GCompile(GCode('<div><template g-for="items;i;row"><button g-attr="attrs">{{tick}}</button></template></div>')) });
    const host = document.createElement('div'); document.body.append(host); app.addTo(host); await app.ready();
    const definitions = [...app.BindDef].map(def => ({ key: def.key }));
    let watchers = 0; app.watch('attrs.title', () => watchers++);
    state.attrs.title = 'B'; for (let i = 0; i < 10; i++) await Promise.resolve();
    const notifications = watchers;
    app.destroy(); return { definitions, notifications };
  });
  await diagnostic.close();
  for (let sample = 0; sample < 7; sample++) {
    for (const method of sample % 2 ? ['attributes', 'for'] : ['for', 'attributes']) {
      for (const v of sample % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) {
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
          await writeFile(path.join(out, 'confirmation.json'), JSON.stringify(report, null, 2));
          console.log(sample, method, variant, 'OK');
        } finally { await context.close(); }
      }
    }
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
