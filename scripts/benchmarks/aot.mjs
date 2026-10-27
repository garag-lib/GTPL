// Reproducible cold AOT comparison. Prepare each revision before modifying it:
// node scripts/benchmarks/aot.mjs prepare reference
// node scripts/benchmarks/aot.mjs prepare candidate
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/benchmarks/aot.mjs run
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
const dir = path.resolve('artifacts/aot');
const [mode, label] = process.argv.slice(2);
const reference = process.env.REFERENCE || 'reference';
const rows = Array.from({ length: 80 }, (_, i) => `<div class="row"><span>${i}</span><b>{{tick}}</b><i title="{{title}}">value</i></div>`).join('');
export const fixtures = {
    plain: '<main><div title="{{title}}"><span>static</span><b>{{tick}}</b></div></main>',
    ...Object.fromEntries([8, 32, 64].map(n => [`switch${n}`, `<main g-switch="active">${Array.from({ length: n }, (_, i) => `<section g-case="${i}">${rows}</section>`).join('')}</main>`])),
    if: `<main><section g-if="active">${rows}</section></main>`,
    list: `<main><section g-for="rows;index;row"><b>{{row.label}}</b>${rows}</section></main>`,
    nested: `<main g-switch="active"><section g-case="0"><article g-if="show"><div g-for="rows;index;row"><b>{{row.label}}</b>${rows}</div></article></section><section g-case="1">${rows}</section></main>`
};
await mkdir(dir, { recursive: true });
if (mode === 'prepare') {
    const dom = new JSDOM('');
    Object.assign(globalThis, { window: dom.window, document: dom.window.document, DOMParser: dom.window.DOMParser, Node: dom.window.Node });
    const target = path.join(dir, label);
    await mkdir(target, { recursive: true });
    const compiler = path.join(target, 'compiler.mjs');
    await build({ entryPoints: ['src/compiler/GCode.ts'], bundle: true, format: 'esm', outfile: compiler });
    const compilerExports = await import(compiler);
    const backend = process.env.BACKEND || 'imperative';
    if (!['legacy', 'imperative'].includes(backend)) throw Error('BACKEND must be legacy or imperative');
    const methodAliases = process.env.METHOD_ALIASES !== '0';
    const GCode = backend === 'imperative' ? compilerExports.GCodeOptimized : compilerExports.GCode;
    await writeFile(path.join(target, 'config.json'), JSON.stringify({ generator: backend === 'imperative' ? 'GCodeOptimized' : 'GCode', options: backend === 'imperative' ? { methodAliases } : {} }, null, 2) + '\n');
    const sizes = {};
    const save = async (name, code) => {
        await writeFile(path.join(target, name), code);
        sizes[name] = { bytes: Buffer.byteLength(code), gzip: gzipSync(code, { level: 9 }).length };
    };
    for (const [name, html] of Object.entries(fixtures))
        await save(name + '.js', GCode(html, { methodAliases }));
    // Identical minifier and options for isolated runtime/compiler and full library.
    for (const [name, source] of Object.entries({ runtime: `export {GTpl} from './src/GTpl'; export {GGenerator,GCompileSafe,GregisterDirective} from './src/GGenerator';`, compiler: `export {GCode,GCodeSafe,GCodeOptimized,GCodeOptimizedSafe} from './src/compiler/GCode';`, full: `export {default} from './src/lib/gtpl';` })) {
        const result = await build({ stdin: { contents: source, resolveDir: process.cwd() }, bundle: true, minify: true, format: 'iife', globalName: 'lib', write: false });
        await save(name + '.js', result.outputFiles[0].text);
    }
    await save('distribution.esm.js', await readFile('dist/gtpl.esm.js', 'utf8'));
    await writeFile(path.join(target, 'sizes.json'), JSON.stringify(sizes, null, 2));
    console.log(sizes);
}
else if (mode === 'run') {
    const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
    const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox', '--js-flags=--expose-gc'] });
    const results = [];
    const samples = Number(process.env.SAMPLES || 12);
    for (const name of Object.keys(fixtures).filter(name => !process.env.FIXTURES || process.env.FIXTURES.split(',').includes(name)))
        for (let sample = 0; sample < samples; sample++)
            for (const revision of (sample % 2 ? [process.env.CANDIDATE || 'candidate', reference] : [reference, process.env.CANDIDATE || 'candidate'])) {
                const page = await browser.newPage();
                await page.addScriptTag({ content: await readFile(path.join(dir, revision, 'runtime.js'), 'utf8') });
                const code = await readFile(path.join(dir, revision, name + '.js'), 'utf8');
                const client = await page.context().newCDPSession(page);
                await client.send('HeapProfiler.collectGarbage');
                const before = (await client.send('Runtime.getHeapUsage')).usedSize;
                if (process.env.PROFILE && sample === 0 && name === 'switch64') {
                    await client.send('Profiler.enable');
                    await client.send('Profiler.start');
                }
                const timing = await page.evaluate(async ({ code, name, bulk }) => {
                    const script = document.createElement('script');
                    script.textContent = 'var g=lib.GGenerator;window.generator=' + code + ';';
                    let t = performance.now();
                    document.head.appendChild(script);
                    const load = performance.now() - t;
                    const { GTpl } = lib;
                    const state = () => ({ active: name === 'if' ? false : 0, show: true, tick: 0, title: 'hello', rows: [{ label: 'a' }, { label: 'b' }] });
                    const mount = async () => { const root = state(); const app = new GTpl({ root, generator }); app.addTo(document.body); await app.ready(); return { app, root }; };
                    t = performance.now();
                    let first = await mount();
                    const mount1 = performance.now() - t;
                    // Drain exactly the runtime's asynchronous refresh work, without timer floors.
                    const settle = async () => {
                        for (let i = 0; i < 80; i++)
                            await Promise.resolve();
                    };
                    t = performance.now();
                    first.root.active = name === 'if' ? true : 1;
                    await settle();
                    const activation = performance.now() - t;
                    // Data changes arrive in separate browser tasks. Yielding also lets
                    // V8 install background optimization between interactions. Exclude
                    // task dispatch time; include the complete asynchronous DOM update.
                    const channel = new MessageChannel();
                    const turn = () => new Promise(resolve => {
                        channel.port1.onmessage = resolve;
                        channel.port2.postMessage(null);
                    });
                    const updateBatch = async (start, count) => {
                        let duration = 0;
                        for (let i = start; i < start + count; i++) {
                            await turn();
                            const start = performance.now();
                            first.root.tick = i;
                            await settle();
                            duration += performance.now() - start;
                        }
                        return duration / count;
                    };
                    const coldUpdate = await updateBatch(1, 20);
                    await updateBatch(21, 100);
                    const update = await updateBatch(121, 200);
                    channel.port1.close();
                    channel.port2.close();
                    t = performance.now();
                    let second = await mount();
                    const mount2 = performance.now() - t;
                    // Both mounted concurrently; subsequent mounts reuse the same definitions.
                    second.app.destroy();
                    t = performance.now();
                    for (let i = 0; i < 4; i++) {
                        const next = await mount();
                        next.app.destroy();
                    }
                    const later = (performance.now() - t) / 4;
                    if (!document.body.querySelector('b'))
                        throw Error('active branch missing: ' + name);
                    if (!document.body.textContent.includes('320'))
                        throw Error('update did not settle: ' + name);
                    let mount1000;
                    if (bulk && name === 'plain') {
                        const views = [];
                        t = performance.now();
                        for (let i = 0; i < 1000; i++) views.push(await mount());
                        mount1000 = performance.now() - t;
                        if (views.some(view => !view.app.Elements[0].querySelector('b')))
                            throw Error('bulk mount missing DOM');
                        for (const view of views) view.app.destroy();
                    }
                    window.retained = first;
                    return { mount1000, load, mount1, total: load + mount1, firstUse: load + mount1 + activation, activation, coldUpdate, update, mount2, later, nodes: document.body.querySelectorAll('*').length };
                }, { code, name, bulk: !!process.env.BULK });
                if (process.env.PROFILE && sample === 0 && name === 'switch64') {
                    const { profile } = await client.send('Profiler.stop');
                    await writeFile(path.join(dir, revision + '.cpuprofile'), JSON.stringify(profile));
                }
                await client.send('HeapProfiler.collectGarbage');
                const live = (await client.send('Runtime.getHeapUsage')).usedSize - before;
                await page.evaluate(() => { retained.app.destroy(); window.retained = null; });
                await client.send('HeapProfiler.collectGarbage');
                const released = (await client.send('Runtime.getHeapUsage')).usedSize - before;
                results.push({ name, revision, sample, ...timing, live, released });
                await page.close();
            }
    await browser.close();
    await writeFile(path.join(dir, process.env.RESULTS || 'results.json'), JSON.stringify(results, null, 2));
    const median = a => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
    for (const name of Object.keys(fixtures).filter(name => !process.env.FIXTURES || process.env.FIXTURES.split(',').includes(name)))
        for (const revision of [reference, process.env.CANDIDATE || 'candidate'])
            console.log(name, revision, Object.fromEntries(['load', 'mount1', 'total', 'firstUse', 'activation', 'later', 'coldUpdate', 'update', 'live', 'released', ...(process.env.BULK && name === 'plain' ? ['mount1000'] : [])].map(k => [k, median(results.filter(r => r.name === name && r.revision === revision).map(r => r[k]))])));
}
else
    throw Error('Use prepare reference|candidate or run');
