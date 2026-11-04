// Prepare both checkouts with this same runner, then run serially in one checkout.
import { build } from 'esbuild';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { distributionSize } from './distribution.mjs';
const directory = path.resolve(process.env.OUTPUT || 'artifacts/runtime-improvements');
const [mode, label] = process.argv.slice(2);
await mkdir(directory, { recursive: true });
if (mode === 'prepare') {
    if (!label || !/^[a-z0-9-]+$/.test(label)) throw Error('prepare requires a label');
    const output = await build({ entryPoints: ['src/lib/gtpl.ts'], bundle: true, minify: true, target: 'es2020', format: 'iife', globalName: 'lib', write: false });
    const source = output.outputFiles[0].text;
    await writeFile(path.join(directory, label + '.js'), source);
    const hash = createHash('sha256');
    async function hashSources(dir) {
        for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) await hashSources(file);
            else hash.update(file).update(await readFile(file));
        }
    }
    await hashSources('src');
    const manifest = { sourceSha256: hash.digest('hex'), bundleSha256: createHash('sha256').update(source).digest('hex'),
        compiler: { generator: 'GCodeOptimized', methodAliases: true }, distribution: await distributionSize('dist/gtpl.esm.js') };
    await writeFile(path.join(directory, label + '.json'), JSON.stringify(manifest, null, 2) + '\n');
} else if (mode === 'run') {
    const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
    const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/google/chrome/chrome', headless: true,
        args: ['--no-sandbox', '--js-flags=--expose-gc'] });
    const results = [], samples = Number(process.env.SAMPLES || 9);
    const sizes = (process.env.ROWS || '1000,10000').split(',').map(Number);
    try {
        for (let sample = 0; sample < samples; sample++) {
            for (const revision of sample % 2 ? ['candidate', 'reference'] : ['reference', 'candidate']) {
                const page = await browser.newPage();
                try {
                    await page.addScriptTag({ path: path.join(directory, revision + '.js') });
                    const records = await page.evaluate(async ({ sizes }) => {
                        const { GTpl, GProxy, unGProxy, jit: { GCompile, GCodeOptimized } } = lib.default || lib;
                        const compile = html => GCompile(GCodeOptimized(html, { methodAliases: true }));
                        const generator = compile('<main><span g-for="rows;i;row">{{return probe(row.label)}}</span></main>');
                        const settle = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
                        const records = [];
                        for (const size of sizes) {
                            let calculations = 0, events = 0;
                            const root = { rows: Array.from({ length: size }, (_, i) => ({ label: String(i) })), probe(value) { calculations++; return value; } };
                            const host = document.createElement('div'); document.body.append(host);
                            let start = performance.now();
                            const app = new GTpl({ root, generator }); app.addTo(host); await app.ready();
                            records.push({ name: 'mount', size, ms: performance.now() - start });
                            app.watch('rows', () => events++); calculations = 0;
                            start = performance.now(); root.rows[size - 1].label = 'single'; await settle();
                            records.push({ name: 'singleNested', size, ms: performance.now() - start, calculations, events });
                            if (host.querySelectorAll('span')[size - 1].textContent !== 'single') throw Error('single row mismatch');
                            calculations = events = 0;
                            start = performance.now();
                            for (let i = 0; i < size; i += 10) root.rows[i].label = 'updated-' + i;
                            await settle();
                            records.push({ name: 'nested', size, ms: performance.now() - start, calculations, events });
                            const check = () => {
                                const nodes = host.querySelectorAll('span');
                                if (nodes.length !== root.rows.length || [...nodes].some((node, i) => node.textContent !== root.rows[i].label)) throw Error('list DOM mismatch');
                            };
                            check();
                            const extra = Array.from({ length: 1000 }, (_, i) => ({ label: 'extra-' + i }));
                            start = performance.now(); root.rows.push(...extra); await settle();
                            records.push({ name: 'append1000', size, ms: performance.now() - start }); check();
                            start = performance.now(); root.rows.splice(0, 100); await settle();
                            records.push({ name: 'splice100', size, ms: performance.now() - start }); check();
                            start = performance.now(); app.destroy();
                            records.push({ name: 'destroy', size, ms: performance.now() - start });
                            if (host.childNodes.length) throw Error('destroy retained DOM'); host.remove();
                        }
                        {
                            const raw = { nested: { value: 1 } }, owner = {}, event = () => {};
                            const proxy = GProxy(raw, event, owner); void proxy.nested.value;
                            let total = 0; const start = performance.now();
                            for (let i = 0; i < 50000; i++) total += proxy.nested.value;
                            records.push({ name: 'proxyReads50000', size: 0, ms: performance.now() - start });
                            if (total !== 50000) throw Error('proxy reads'); unGProxy(raw, event, owner);
                        }
                        for (const size of [10, 100, 1000]) {
                            let duration = 0;
                            for (let repeat = 0; repeat < 23; repeat++) {
                                const raw = {}, owner = {}, event = () => {};
                                for (let i = 0; i < size; i++) GProxy(raw, event, owner, [String(i)]);
                                const start = performance.now(); unGProxy(raw, event, owner);
                                const elapsed = performance.now() - start;
                                if (repeat >= 3) duration += elapsed;
                            }
                            records.push({ name: 'unsubscribe', size, ms: duration / 20 });
                        }
                        {
                            const views = []; const generator = compile('<main title="static" class="card"><span>static</span></main>');
                            globalThis.gc?.();
                            const start = performance.now();
                            for (let i = 0; i < 1000; i++) { const app = new GTpl({ root: {}, generator }); views.push(app); await app.ready(); }
                            records.push({ name: 'staticInstances1000', size: 1000, ms: performance.now() - start });
                            globalThis.gc?.();
                            for (const app of views) app.destroy();
                        }
                        return records;
                    }, { sizes });
                    for (const record of records) results.push({ sample, revision, ...record });
                } finally { await page.close(); }
            }
            console.log(`sample ${sample + 1}/${samples}`);
        }
        const manifests = {};
        for (const revision of ['reference', 'candidate']) manifests[revision] = JSON.parse(await readFile(path.join(directory, revision + '.json')));
        await writeFile(path.join(directory, 'results.json'), JSON.stringify({ browser: browser.version(), node: process.version,
            cpu: os.cpus()[0].model, samples, manifests, results }, null, 2) + '\n');
        const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
        for (const key of [...new Set(results.map(row => row.name + ':' + row.size))]) {
            const [name, size] = key.split(':');
            const reference = median(results.filter(row => row.name === name && row.size === Number(size) && row.revision === 'reference').map(row => row.ms));
            const candidate = median(results.filter(row => row.name === name && row.size === Number(size) && row.revision === 'candidate').map(row => row.ms));
            console.log(`${key}: ${reference.toFixed(3)} -> ${candidate.toFixed(3)} ms (${reference ? ((candidate / reference - 1) * 100).toFixed(1) + '%' : 'below clock resolution'})`);
        }
    } finally { await browser.close(); }
} else throw Error('Use prepare <label> or run');
