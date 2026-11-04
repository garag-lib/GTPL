import {fileURLToPath} from 'node:url';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const out=path.resolve(root,process.env.UI_ARTIFACTS || 'artifacts/benchmark-refresh');
await mkdir(out,{recursive:true});
const origin=process.env.BENCHMARK_ORIGIN || 'http://127.0.0.1:4173';
const browser=await chromium.launch({executablePath:process.env.CHROME || '/opt/google/chrome/chrome',headless:true,args:['--no-sandbox']});
const errors=[];let page;
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/benchmarks.html');
 await page.waitForSelector('.ranking-row.gtpl');
 assert.equal(await page.locator('#overview-ranking .ranking-row:not(.ranking-head)').count(),7);
 assert.equal(await page.locator('#overview-metric option').count(),24);
 assert.equal(await page.locator('option[value=vanilla]').count(),0);
 for (const id of await page.locator('#overview-metric option').evaluateAll(options=>options.map(option=>option.value))) {
  await page.selectOption('#overview-metric',id);
  assert.equal(await page.locator('#overview-ranking .ranking-row:not(.ranking-head)').count(),id.startsWith('grid-')?8:7);
  assert.doesNotMatch(await page.locator('#overview-ranking').innerText(),/vanilla|javascript directo|direct javascript/i);
 }
 await page.selectOption('#overview-metric','heap-switch-64');
 const normal=await page.locator('#overview-ranking').innerText();
 await page.screenshot({path:out+'/page-desktop.png',fullPage:false});
 await page.selectOption('#language','en');assert.match(await page.locator('#overview h2').innerText(),/Where GTPL shines/);
 await page.selectOption('#overview-metric','edit-one');assert.equal(await page.locator('#overview-ranking .ranking-row:not(.ranking-head)').count(),7);
 await page.selectOption('#overview-metric','grid-full');assert.equal(await page.locator('#overview-ranking .ranking-row:not(.ranking-head)').count(),8);
 assert.match(await page.locator('#overview-note').innerText(),/Flutter/);
 await page.selectOption('#language','es');await page.selectOption('#overview-metric','heap-switch-64');
 assert.equal(await page.locator('#overview-ranking').innerText(),normal);
 await page.selectOption('#size','500'); await page.selectOption('#samples','3');
 await page.click('#run');await page.waitForFunction(()=>!document.querySelector('#export-json').disabled && !document.querySelector('#run').disabled,null,{timeout:120000});
 assert.doesNotMatch(await page.locator('#status').innerText(),/fall|error|detenid|interrump/i);
 const [download]=await Promise.all([page.waitForEvent('download'),page.click('#export-json')]);
 const saved=JSON.parse(await readFile(await download.path(),'utf8'));
 assert.equal(saved.errors.length,0);assert.equal(saved.samples.gtpl.length,3);assert.equal(saved.samples.react.length,3);
 for(const samples of Object.values(saved.samples))for(const sample of samples){assert.equal(sample.result.validated,true);assert.ok(sample.result.metrics.editOneMs>0);assert.ok(sample.result.metrics.editTenthMs>0);}
 const widths=await page.locator('#charts .chart-card').first().locator('.bar-fill').evaluateAll(nodes=>nodes.map(n=>parseFloat(n.style.width)));
 const median=a=>a.sort((a,b)=>a-b)[1];const av=median(saved.samples.gtpl.map(s=>s.result.metrics.editOneMs)),bv=median(saved.samples.react.map(s=>s.result.metrics.editOneMs));
 assert.ok(Math.abs(widths[0]-100*Math.min(av,bv)/av)<0.01);assert.ok(Math.abs(widths[1]-100*Math.min(av,bv)/bv)<0.01);
 await writeFile(out+'/ui-live-results.json',JSON.stringify(saved,null,2));
 await page.setViewportSize({width:390,height:844});await page.goto(origin+'/benchmarks.html');await page.waitForSelector('.ranking-row.gtpl');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'mobile horizontal overflow');
 await page.screenshot({path:out+'/page-mobile.png',fullPage:false});
 await page.locator('.overview-details > summary').click();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'expanded details overflow on mobile');
 await page.goto(origin+'/benchmarks/lab.html?method=for&lang=en');await page.waitForSelector('.ranking-row.gtpl');assert.equal(await page.locator('#method').inputValue(),'for');
 await page.route('**/results/latest.json',async route=>{const response=await route.fetch();const result=await response.json();await route.fulfill({response,json:{...result,manifestSHA256:'outdated'}});});
 await page.reload();await page.waitForFunction(()=>document.querySelector('#overview-meta').textContent.includes('unavailable'));
 assert.equal(await page.locator('.ranking-row.gtpl').count(),0,'stale results must not be displayed');
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: desktop/mobile, 24 comparisons, 7/8 engines, ES/EN, 6 live validated samples, higher-is-better bars, isolated lab, stale result rejection, no console errors');
} finally {await browser.close();}
