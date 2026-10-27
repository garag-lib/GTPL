// Prepare before changing the runtime: node scripts/benchmarks/scheduler.mjs prepare reference
// Then prepare candidate and run. All templates use the imperative compiler with aliases.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
const dir = path.resolve('artifacts/scheduler');
await mkdir(dir, { recursive: true });
const [mode, label] = process.argv.slice(2);
if (mode === 'prepare') {
    if (!label || !/^[a-z0-9-]+$/.test(label)) throw Error('prepare requires a label');
    const result = await build({ entryPoints: ['src/lib/gtpl.ts'], bundle: true, minify: true, format: 'iife', globalName: 'lib', write: false, logLevel: 'silent' });
    await writeFile(path.join(dir, label + '.js'), result.outputFiles[0].text);
} else if (mode === 'run') {
    const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
    const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] });
    const samples = Number(process.env.SAMPLES || 15);
    const results = [];
    try {
        for (let sample = 0; sample < samples; sample++)
            for (const revision of sample % 2 ? ['candidate', 'reference'] : ['reference', 'candidate']) {
                const page = await browser.newPage();
                try {
                    await page.addScriptTag({ path: path.join(dir, revision + '.js') });
                    const rows = await page.evaluate(async () => {
                        const { GTpl, jit: { GCompile, GCodeOptimized } } = lib.default || lib;
                        const generator = GCompile(GCodeOptimized('<main><span>{{return probe(value)}}</span></main>', { methodAliases: true }));
                        const listGenerator = GCompile(GCodeOptimized('<main><span g-for="rows;i;row">{{return probe(row.value)}}</span></main>', { methodAliases: true }));
                        const descriptor = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
                        const settle = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
                        const make = async (list = false) => {
                            let events = 0, calculations = 0, writes = 0;
                            const root = { value: 0, rows: Array.from({ length: 100 }, () => ({ value: 0 })), probe(value) { calculations++; return value; } };
                            const host = document.createElement('div'); document.body.append(host);
                            const app = new GTpl({ root, generator: list ? listGenerator : generator }); app.addTo(host); await app.ready();
                            for (const span of host.querySelectorAll('span')) {
                                const text = span.firstChild;
                                Object.defineProperty(text, 'textContent', { configurable: true, get() { return descriptor.get.call(this); }, set(value) { writes++; descriptor.set.call(this, value); } });
                            }
                            app.watch(list ? 'rows' : 'value', () => events++);
                            calculations = 0;
                            return { root, host, app, counts: () => ({ events, calculations, writes }), destroy() { app.destroy(); if (host.childNodes.length) throw Error('destroy retained DOM'); host.remove(); } };
                        };
                        const records = [];
                        for (const count of [1, 10, 1000]) {
                            const view = await make(); const start = performance.now();
                            for (let i = 1; i <= count; i++) view.root.value = i;
                            const synchronousCalculations = view.counts().calculations;
                            if (view.root.value !== count) throw Error('state was deferred');
                            await settle(); const duration = performance.now() - start;
                            if (view.host.textContent !== String(count)) throw Error('wrong burst value');
                            records.push({ name: 'burst' + count, duration, synchronousCalculations, ...view.counts() }); view.destroy();
                        }
                        {
                            const view = await make(); const start = performance.now();
                            for (let i = 1; i <= 1000; i++) view.root.value = i;
                            view.root.value = 0; await settle();
                            if (view.host.textContent !== '0') throw Error('wrong final unchanged value');
                            records.push({ name: 'unchanged', duration: performance.now() - start, ...view.counts() }); view.destroy();
                        }
                        {
                            const view = await make(true); const start = performance.now();
                            for (let i = 1; i <= 1000; i++) view.root.rows[40].value = i;
                            await settle();
                            if (view.host.querySelectorAll('span')[40].textContent !== '1000') throw Error('wrong list value');
                            if (view.host.querySelectorAll('span').length !== 100) throw Error('wrong list length');
                            records.push({ name: 'rowBurst1000', duration: performance.now() - start, ...view.counts() }); view.destroy();
                        }
                        {
                            const view = await make();
                            const channel = new MessageChannel();
                            const turn = () => new Promise(resolve => { channel.port1.onmessage = resolve; channel.port2.postMessage(null); });
                            let duration = 0;
                            for (let i = 1; i <= 200; i++) { await turn(); const start = performance.now(); view.root.value = i; await settle(); duration += performance.now() - start; }
                            channel.port1.close(); channel.port2.close();
                            if (view.host.textContent !== '200') throw Error('wrong independent task value');
                            records.push({ name: 'separateTasks200', duration: duration / 200, ...view.counts() }); view.destroy();
                        }
                        return records;
                    });
                    for (const row of rows) results.push({ revision, sample, ...row });
                } finally { await page.close(); }
            }
        const sizes = {};
        for (const revision of ['reference', 'candidate']) {
            const source = await readFile(path.join(dir, revision + '.js'));
            sizes[revision] = { bytes: source.length, gzipBytes: gzipSync(source, { level: 9 }).length, sha256: createHash('sha256').update(source).digest('hex') };
        }
        const record = { browser: browser.version(), samples, compiler: { generator: 'GCodeOptimized', options: { methodAliases: true } }, sizes, results };
        await writeFile(path.join(dir, 'results.json'), JSON.stringify(record, null, 2) + '\n');
        const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
        for (const name of [...new Set(results.map(row => row.name))])
            for (const revision of ['reference', 'candidate']) {
                const rows = results.filter(row => row.name === name && row.revision === revision);
                console.log(name, revision, Object.fromEntries(['duration', 'events', 'calculations', 'writes'].map(key => [key, median(rows.map(row => row[key]))])));
            }
    } finally { await browser.close(); }
} else throw Error('Use prepare label or run');
