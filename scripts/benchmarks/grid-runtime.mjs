// Compare real, rebuilt grid adapters using the same complete DOM/layout fence.
// Before runtime edits: node scripts/benchmarks/grid-runtime.mjs prepare reference
// After rebuilding public benchmarks: node scripts/benchmarks/grid-runtime.mjs prepare candidate
// Start serve.mjs, then: PLAYWRIGHT_MODULE=/.../playwright/index.mjs node scripts/benchmarks/grid-runtime.mjs run
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const dir = path.resolve('artifacts/scheduler');
await mkdir(dir, { recursive: true });
const [mode, label] = process.argv.slice(2);
if (mode === 'prepare') {
    if (!['reference', 'candidate'].includes(label)) throw Error('Use reference or candidate');
    await writeFile(path.join(dir, 'grid-' + label + '.js'), await readFile('docs/benchmarks/vendor/grid-gtpl.js'));
    await writeFile(path.join(dir, 'grid-vue.js'), await readFile('docs/benchmarks/vendor/grid-vue.js'));
} else if (mode === 'run') {
    const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
    const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] });
    const origin = process.env.BENCH_ORIGIN || 'http://127.0.0.1:4187';
    const samples = Number(process.env.SAMPLES || 5);
    const durationMs = Number(process.env.GRID_DURATION_MS || 1000);
    const sizes = (process.env.GRID_SIZES || '32,128').split(',').map(Number);
    const densities = (process.env.GRID_DENSITIES || '10,25,100').split(',').map(Number);
    const engines = process.env.GRID_ENGINES ? process.env.GRID_ENGINES.split(',') : ['reference', 'candidate', 'vue'];
    const codes = Object.fromEntries(await Promise.all(engines.map(async name => [name, (await readFile(path.join(dir, 'grid-' + name + '.js'))).toString('base64')])));
    const results = [], mounts = [];
    try {
        for (const size of sizes)
            for (let sample = 0; sample < samples; sample++) {
                const order = engines.slice();
                if (sample % 2) order.reverse();
                for (const revision of order) {
                    // Separate fresh-page mounting/heap measurement from frame timing.
                    const page = await browser.newPage();
                    try {
                        await page.goto(origin + '/benchmarks/runner.html');
                        const client = await page.context().newCDPSession(page);
                        await page.evaluate(async encoded => { window.gridAdapter = (await import('data:text/javascript;base64,' + encoded)).createAdapter(); }, codes[revision]);
                        await client.send('HeapProfiler.collectGarbage');
                        const before = (await client.send('Runtime.getHeapUsage')).usedSize;
                        const mountMs = await page.evaluate(async size => {
                            const host = document.querySelector('#app');
                            host.style.setProperty('--grid-cols', size); host.style.setProperty('--grid-rows', size);
                            const start = performance.now(); await gridAdapter.mount(host, { columns: size, rows: size });
                            const duration = performance.now() - start;
                            if (host.querySelectorAll('.grid-cell').length !== size * size) throw Error('incorrect mount');
                            return duration;
                        }, size);
                        await client.send('HeapProfiler.collectGarbage');
                        const live = (await client.send('Runtime.getHeapUsage')).usedSize - before;
                        await page.evaluate(async () => { await gridAdapter.destroy(); window.gridAdapter = null; document.querySelector('#app').replaceChildren(); });
                        await client.send('HeapProfiler.collectGarbage');
                        const released = (await client.send('Runtime.getHeapUsage')).usedSize - before;
                        mounts.push({ revision, sample, size, cells: size * size, mountMs, live, released });
                    } finally { await page.close(); }
                    for (const percent of densities) {
                        const page = await browser.newPage();
                        try {
                            await page.goto(origin + '/benchmarks/runner.html');
                            const result = await page.evaluate(async ({ encoded, size, percent, durationMs }) => {
                                const { createAdapter } = await import('data:text/javascript;base64,' + encoded);
                                const { runGrid } = await import('/benchmarks/grid-runner.js');
                                const config = { grid: { columns: size, rows: size, step: 1, levels: 1, percent, durationMs, seed: 42 } };
                                return await runGrid(config, createAdapter, document.querySelector('#app'), document.querySelector('#runner-status'));
                            }, { encoded: codes[revision], size, percent, durationMs });
                            if (!result.validated || !result.grid[0]?.validated) throw Error('grid validation missing');
                            results.push({ revision, sample, ...result.grid[0] });
                        } finally { await page.close(); }
                    }
                    console.log(size, revision, 'sample', sample + 1, 'passed');
                }
            }
        const sources = Object.fromEntries(engines.map(name => [name, { bytes: Buffer.from(codes[name], 'base64').length, sha256: createHash('sha256').update(Buffer.from(codes[name], 'base64')).digest('hex') }]));
        await writeFile(path.join(dir, process.env.GRID_RESULTS || 'grid-results.json'), JSON.stringify({ browser: browser.version(), samples, durationMs, sources, mounts, results, timing: 'adapter call + returned Promise + all modified DOM + layout', compiler: { generator: 'GCodeOptimized', options: { methodAliases: true } } }, null, 2) + '\n');
    } finally { await browser.close(); }
} else throw Error('Use prepare reference|candidate or run');
