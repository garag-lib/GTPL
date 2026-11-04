// Separate forced-GC pass. Requires runtime-improvements.mjs prepare for each revision.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const directory = path.resolve(process.env.OUTPUT || 'artifacts/runtime-improvements');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/google/chrome/chrome', headless: true,
    args: ['--no-sandbox', '--js-flags=--expose-gc'] });
const results = [];
try {
    for (let sample = 0; sample < Number(process.env.SAMPLES || 3); sample++)
        for (const size of [1000, 10000])
            for (const watchers of [false, true])
                for (const revision of sample % 2 ? ['candidate', 'reference'] : ['reference', 'candidate']) {
                    const page = await browser.newPage();
                    try {
                        await page.addScriptTag({ path: path.join(directory, revision + '.js') });
                        await page.evaluate(() => {
                            const api = lib.default || lib;
                            globalThis.generator = api.jit.GCompile(api.jit.GCodeOptimized('<b>{{value}}</b>', { methodAliases: true }));
                        });
                        const cdp = await page.context().newCDPSession(page);
                        const heap = async () => {
                            await cdp.send('HeapProfiler.collectGarbage');
                            return (await cdp.send('Runtime.getHeapUsage')).usedSize;
                        };
                        const before = await heap();
                        await page.evaluate(async ({ size, watchers }) => {
                            const { GTpl } = lib.default || lib;
                            globalThis.views = []; globalThis.observed = [];
                            for (let i = 0; i < size; i++) {
                                const view = new GTpl({ root: { value: i }, generator });
                                if (watchers) view.watch('value', () => {});
                                view.addTo(document.body); views.push(view); await view.ready();
                                if (i < 10) observed.push(new WeakRef(view));
                            }
                            if (document.querySelectorAll('b').length !== size) throw Error('mount incomplete');
                        }, { size, watchers });
                        const active = await heap();
                        await page.evaluate(() => {
                            for (const view of views) view.destroy();
                            globalThis.views = null;
                            if (document.body.childNodes.length) throw Error('retained DOM');
                        });
                        const after = await heap();
                        const retained = await page.evaluate(() => observed.filter(ref => ref.deref()).length);
                        if (retained) throw Error(`${revision} retained ${retained} observed instances`);
                        results.push({ revision, sample, size, watchers, active: active - before, residual: after - before, retained });
                    } finally { await page.close(); }
                }
    const inheritance = [];
    for (const revision of ['reference', 'candidate']) {
        const page = await browser.newPage();
        try {
            await page.addScriptTag({ path: path.join(directory, revision + '.js') });
            const residualBindings = await page.evaluate(async () => {
                const { GTpl } = lib.default || lib;
                globalThis.grand = new GTpl({ root: { grand: 1 }, generator: () => [] });
                globalThis.parentView = new GTpl({ parent: grand, root: { parent: 2 }, context: ['parent'], generator: () => [] });
                globalThis.children = [];
                for (let i = 0; i < 10; i++) {
                    const child = new GTpl({ parent: parentView, root: { local: 3 }, context: ['local'], generator: ctx => {
                        const text = document.createTextNode('');
                        ctx.addBind({ type: 0, ele: text, link: { formula: { vars: [['grand'], ['parent'], ['local']], fnc: (a,b,c) => a+b+c } } });
                        return [text];
                    } });
                    await child.ready(); children.push(new WeakRef(child)); child.destroy();
                }
                return grand.BindTree.grand.me.size + parentView.BindTree.parent.me.size;
            });
            const cdp = await page.context().newCDPSession(page);
            await cdp.send('HeapProfiler.collectGarbage');
            const retained = await page.evaluate(() => children.filter(ref => ref.deref()).length);
            inheritance.push({ revision, residualBindings, retained });
            if (revision === 'candidate' && (residualBindings || retained)) throw Error('inherited bindings retained');
        } finally { await page.close(); }
    }
    const manifests = {};
    for (const revision of ['reference', 'candidate']) manifests[revision] = JSON.parse(await readFile(path.join(directory, revision + '.json')));
    await writeFile(path.join(directory, 'memory.json'), JSON.stringify({ browser: browser.version(), manifests, results, inheritance }, null, 2) + '\n');
    console.log(JSON.stringify({ inheritance, results }, null, 2));
} finally { await browser.close(); }
