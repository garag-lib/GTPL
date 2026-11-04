// Diagnostic only: counters and sampled CPU profiles, separate from ranked timings.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(root, 'artifacts/update-analysis');
await mkdir(output, { recursive: true });
const count = name => `globalThis.__counts[${JSON.stringify(name)}] = (globalThis.__counts[${JSON.stringify(name)}] || 0) + 1;`;
function insert(source, anchor, name) {
  if (source.split(anchor).length !== 2) throw Error(`Instrumentation anchor: ${name}`);
  return source.replace(anchor, anchor + count(name));
}
for (const variant of ['plain', 'counts', 'lazy', 'attrs']) {
  const instrumented = variant === 'counts';
  const result = await build({ entryPoints: [path.join(root, 'src/lib/gtpl.ts')], bundle: true, minify: false,
    target: 'es2020', format: 'iife', globalName: 'lib', write: false,
    plugins: variant !== 'plain' ? [{ name: 'diagnostic-counters', setup(builder) {
      builder.onLoad({ filter: /\/(GTpl|GProxy)\.ts$/ }, async args => {
        let source = await readFile(args.path, 'utf8');
        if (!instrumented) {
          if (variant === 'lazy' && args.path.endsWith('/GTpl.ts'))
            source = source.replace('} else ordinary = isOrdinaryData(rows);', '} else ordinary = !!job.listUpdate && isOrdinaryData(rows);');
          if (variant === 'attrs' && args.path.endsWith('/GTpl.ts'))
            source = source.replace('for (let key in result) {', 'for (let key in toRaw(result)) {');
          return { contents: source, loader: 'ts', resolveDir: path.dirname(args.path) };
        }
        if (args.path.endsWith('/GTpl.ts')) {
          source = insert(source, 'set: function (newval: any) {', 'rootSet');
          source = insert(source, 'function isOrdinaryData(value: any, seen = new Set<object>()): boolean {', 'ordinaryDataVisit');
          source = insert(source, 'const updateProperty = (prop: string, value: any) => {', 'attributeProperty');
          source = insert(source, 'bind.ele.textContent = result;', 'textWrite');
          source = insert(source, 'for (let key in result) {', 'attributeEntry');
          source = insert(source, 'const result = calculateBind(this, bind, value);', 'calculateBind');
        } else {
          source = insert(source, 'get(target, prop, receiver) {', 'proxyGet');
          source = insert(source, 'ownKeys(target) {', 'proxyOwnKeys');
          source = insert(source, 'getOwnPropertyDescriptor(target, prop) {', 'proxyDescriptor');
          source = insert(source, 'function newSubscriptionPath(): SubscriptionPath {', 'subscriptionNodeNew');
          source = insert(source, 'const subscription = { event, objRef, parentPath: parentPath.slice(), node };', 'subscriptionAdded');
          source = insert(source, 'removed = true;', 'subscriptionRemoved');
          source = insert(source, 'entry.revoke();', 'proxyRevoked');
          source = insert(source, 'const { proxy, revoke } = Proxy.revocable(target, handler);', 'proxyCreated');
        }
        return { contents: source, loader: 'ts', resolveDir: path.dirname(args.path) };
      });
    } }] : [] });
  await writeFile(path.join(output, variant + '.js'), result.outputFiles[0].text);
}
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] });
const report = { diagnostic: 'Separate unminified source bundles; counters never used for timing. Profiles include base resets and final layout; stack attribution filters measured-update windows.', records: [] };
const cases = ['append', 'remove', 'update', 'attrs', 'attrsOnly', 'textOnly', 'attrsNested', 'appendShared'];
const runs = [
  ...cases.map(name => ({ kind: 'counts', variant: 'counts', name })),
  ...cases.map(name => ({ kind: 'profile', variant: 'plain', name })),
  ...Array.from({ length: 7 }, (_, round) => ['append', 'remove', 'update', 'attrs', 'attrsNested'].flatMap(name => {
    const variants = ['plain', name.startsWith('attrs') ? 'attrs' : 'lazy'];
    if (round % 2) variants.reverse();
    return variants.map(variant => ({ kind: 'timing', name, variant, round }));
  })).flat(),
];
try {
    for (const run of runs) {
      const { name, kind, variant } = run;
      const instrumented = kind === 'counts';
      const page = await browser.newPage({ viewport: { width: 960, height: 190 } });
      await page.evaluate(() => { globalThis.__counts = {}; });
      await page.addScriptTag({ path: path.join(output, variant + '.js') });
      await page.evaluate(async ({ name, instrumented }) => {
        const { GTpl, jit: { GCompile, GCode } } = lib.default;
        const rows = (size, tick = 0, offset = 0) => Array.from({ length: size }, (_, i) => ({ id: i + offset, label: 'Item ' + (i + offset), value: tick }));
        const list = ['append', 'remove', 'update', 'appendShared'].includes(name);
        const state = { rows: rows(500), items: rows(500), tick: 0, attrs: { title: 'Estado 0', 'data-state': '0', 'aria-label': 'Estado 0' } };
        const template = list
          ? '<div><template g-for="rows;index;row"><article class="method-row" data-key="{{row.id}}"><b>{{row.label}}</b><i>{{row.value}}</i></article></template></div>'
          : '<div><template g-for="items;index;row"><button class="bench-attr" g-attr="attrs">{{tick}}</button></template></div>';
        const host = document.createElement('div'); document.body.append(host);
        const app = new GTpl({ root: state, generator: GCompile(GCode(template)) }); app.addTo(host); await app.ready();
        const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
        if (instrumented) {
          for (const method of ['queueChange', 'applyChange', 'eventPRoxy']) {
            const original = GTpl.prototype[method];
            GTpl.prototype[method] = function(...args) {
              const suffix = method === 'eventPRoxy' ? '' : '/' + args[1]?.type;
              const key = method + suffix;
              __counts[key] = (__counts[key] || 0) + 1;
              return original.apply(this, args);
            };
          }
        }
        globalThis.__run = async (iterations) => {
          const output = [];
          for (let iteration = 0; iteration < iterations; iteration++) {
            const base = rows(500);
            if (list) { state.rows = base; await settle(); }
            const tick = iteration + 1;
            const next = name === 'append' ? [...rows(500), ...rows(125, tick, 500)]
              : name === 'appendShared' ? [...base, ...rows(125, tick, 500)]
              : name === 'remove' ? rows(250, tick) : rows(500, tick);
            host.getBoundingClientRect();
            __counts = {};
            const start = performance.now();
            if (list) state.rows = next;
            else if (name === 'attrsNested') { state.attrs.title = 'Estado ' + tick; }
            else {
              if (name !== 'attrsOnly') state.tick = tick;
              if (name !== 'textOnly') state.attrs = { title: 'Estado ' + tick, 'data-state': String(tick), 'aria-label': 'Estado ' + tick };
            }
            const dispatch = performance.now();
            await settle();
            const applied = performance.now();
            host.getBoundingClientRect();
            const end = performance.now();
            const counts = { ...__counts };
            if (list) {
              const nodes = [...host.querySelectorAll('article')];
              if (nodes.length !== next.length || nodes.some((node, i) => node.dataset.key !== String(next[i].id) || node.children[0].textContent !== next[i].label || node.children[1].textContent !== String(next[i].value))) throw Error('List mismatch');
            } else {
              const nodes = [...host.querySelectorAll('button')];
              if (nodes.length !== 500 || nodes.some(node => node.textContent !== String(state.tick) || node.title !== state.attrs.title || node.getAttribute('data-state') !== state.attrs['data-state'] || node.getAttribute('aria-label') !== state.attrs['aria-label'])) throw Error('Attributes mismatch');
            }
            output.push({ dispatchMs: dispatch - start, applyMs: applied - dispatch, layoutMs: end - applied, totalMs: end - start, counts,
              startRelative: start, endRelative: end });
          }
          return output;
        };
        globalThis.__cleanup = () => { app.destroy(); if (host.childNodes.length) throw Error('Cleanup retained nodes'); };
      }, { name, instrumented });
      let profile;
      if (kind === 'profile') {
        await page.evaluate(() => __run(15));
        const client = await page.context().newCDPSession(page);
        await client.send('Profiler.enable');
        await client.send('Profiler.setSamplingInterval', { interval: 100 });
        // CDP monotonic epoch alignment is captured, without assuming a wall-clock origin.
        const clock = await client.send('Performance.enable');
        const metrics = await client.send('Performance.getMetrics');
        report.records.push({ kind: 'clock', name, metrics: metrics.metrics });
        await client.send('Profiler.start');
        const operations = await page.evaluate(() => __run(100));
        profile = (await client.send('Profiler.stop')).profile;
        await writeFile(path.join(output, name + '.cpuprofile'), JSON.stringify(profile));
        report.records.push({ kind: 'profile', name, operations });
      } else if (instrumented) {
        const operations = await page.evaluate(() => __run(1));
        report.records.push({ kind: 'counts', name, operations });
      } else {
        await page.evaluate(() => __run(10));
        const operations = await page.evaluate(() => __run(20));
        report.records.push({ ...run, operations });
      }
      await page.evaluate(() => __cleanup());
      await page.close();
      await writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
      console.log(kind.toUpperCase(), name, variant, run.round ?? '', 'OK');
    }
} finally { await browser.close(); }
