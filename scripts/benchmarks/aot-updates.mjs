// Paired update control: both generators use the SAME runtime in the SAME realm.
// Eliminates differences in asynchronous V8 tiering between cold browser realms.
import { readFile, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
const results = [];
for (const name of ['switch8', 'switch32', 'switch64', 'if', 'list', 'nested']) {
    const page = await browser.newPage();
    await page.addScriptTag({ content: await readFile('artifacts/aot/reference/runtime.js', 'utf8') });
    for (const revision of ['reference', 'candidate'])
        await page.addScriptTag({ content: `var g=lib.GGenerator;window.${revision}=${await readFile(`artifacts/aot/${revision}/${name}.js`, 'utf8')};` });
    results.push({ name, ...await page.evaluate(async (name) => {
            const views = [];
            for (const generator of [reference, candidate]) {
                const root = { active: name === 'if' ? true : 1, show: true, tick: 0, title: 'hello', rows: [{ label: 'a' }, { label: 'b' }] };
                const app = new lib.GTpl({ root, generator });
                app.addTo(document.body);
                await app.ready();
                views.push({ app, root });
            }
            const settle = async () => { for (let i = 0; i < 80; i++)
                await Promise.resolve(); };
            const batch = async (view, base, count) => { const start = performance.now(); for (let i = 0; i < count; i++) {
                view.root.tick = base + i;
                await settle();
            } return (performance.now() - start) / count; };
            for (let round = 0; round < 20; round++)
                for (const view of views)
                    await batch(view, round * 50, 50);
            const samples = [];
            for (let round = 0; round < 40; round++) {
                const pair = [];
                for (const index of (round % 2 ? [1, 0] : [0, 1]))
                    pair[index] = await batch(views[index], 1000 + round * 25, 25);
                samples.push({ reference: pair[0], candidate: pair[1] });
            }
            for (const view of views)
                view.app.destroy();
            return { samples };
        }, name) });
    await page.close();
}
await browser.close();
await writeFile('artifacts/aot/updates.json', JSON.stringify(results, null, 2));
for (const { name, samples } of results) {
    const median = a => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
    console.log(name, median(samples.map(s => s.reference)), median(samples.map(s => s.candidate)), median(samples.map(s => s.candidate - s.reference)));
}
