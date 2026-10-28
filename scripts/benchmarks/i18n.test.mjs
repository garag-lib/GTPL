import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { getLanguage, setLanguage, translateDOM, formatNumber, errorMessage, onLanguageChange } from '../../docs/benchmarks/i18n.js';
import { METHODS, selectedMetrics } from '../../docs/benchmarks/method-catalog.js';
import { comparison, summarize } from '../../docs/benchmarks/stats.js';
import { renderMemoryProgress } from '../../docs/benchmarks/memory-progress.js';
import { renderGridCharts } from '../../docs/benchmarks/grid-charts.js';
import { gridSizes } from '../../docs/benchmarks/grid-workload.js';

test('selecting the current language preserves dynamic UI and does not notify a change', () => {
  const original = getLanguage(), oldDocument = globalThis.document;
  const dom = new JSDOM('<p data-i18n-en="Loading…" data-i18n-es="Cargando…">Cargando…</p>');
  globalThis.document = dom.window.document;
  setLanguage('es');
  translateDOM();
  const status = document.querySelector('p');
  status.textContent = '3 muestras completas';
  let changes = 0;
  const unsubscribe = onLanguageChange(() => changes++);
  try {
    setLanguage('es');
    assert.equal(status.textContent, '3 muestras completas');
    assert.equal(changes, 0);
    setLanguage('en');
    assert.equal(changes, 1);
    assert.equal(document.documentElement.lang, 'en');
    assert.equal(status.textContent, 'Loading…');
  } finally {
    unsubscribe();
    globalThis.document = oldDocument;
    dom.window.close();
    setLanguage(original);
  }
});

test('existing metadata and measured results can switch languages without recalculation', () => {
  const original = getLanguage();
  const metric = selectedMetrics('switch')[0];
  const before = summarize([10, 20, 30]);
  const after = summarize([20, 40, 60]);
  try {
    setLanguage('es');
    assert.equal(METHODS.switch.title, 'Switch · memoria de ramas grandes');
    assert.equal(metric.title, 'Definiciones, sin vista');
    const numericResult = comparison(before, after, { direction: 'lower' });
    setLanguage('en');
    assert.equal(METHODS.switch.title, 'Switch · large-branch memory');
    assert.equal(metric.title, 'Definitions, no active view');
    assert.equal(selectedMetrics('switch').find(m => m.key === 'activeElements').unit, 'elements');
    assert.deepEqual(comparison(before, after, { direction: 'lower' }), numericResult);
    assert.match(comparison(null, after, metric).text, /Three valid samples/);
    assert.equal(formatNumber(12345.5), '12,345.5');
    assert.throws(() => gridSizes({ columns: 1, rows: 2, step: 1, levels: 1 }), /Invalid grid dimensions/);
    setLanguage('es');
    assert.equal(metric.title, 'Definiciones, sin vista');
    assert.equal(formatNumber(12345.5), '12.345,5');
    assert.throws(() => gridSizes({ columns: 1, rows: 2, step: 1, levels: 1 }), /Dimensiones del grid inválidas/);
  } finally { setLanguage(original); }
});

test('language rendering preserves controls and raw memory phases while translating visible status', () => {
  const original = getLanguage();
  const dom = new JSDOM('<label><span data-i18n-en="Samples" data-i18n-es="Muestras">Muestras</span><select><option value="3" selected>3</option></select></label><p id="status"></p><span id="live"></span><progress value="0" max="6"></progress>');
  const document = dom.window.document;
  const select = document.querySelector('select');
  const progress = { kind: 'memory', phase: 'definiciones y estado inicial', index: 2, total: 3, reading: true, waitedMs: 17000, timeoutMs: 30000 };
  const targets = { status: document.querySelector('#status'), live: document.querySelector('#live'), bar: document.querySelector('progress'), completed: 0 };
  try {
    setLanguage('en'); translateDOM(document);
    assert.equal(document.documentElement.lang, 'en');
    assert.equal(document.querySelector('label span').textContent, 'Samples');
    assert.equal(document.querySelector('select'), select);
    assert.equal(select.value, '3');
    renderMemoryProgress(targets, 'GTPL', progress);
    assert.match(targets.status.textContent, /memory 2\/3: definitions and initial state.*waiting 17 s/);
    assert.equal(progress.phase, 'definiciones y estado inicial');
    assert.equal(targets.bar.hasAttribute('value'), false);
    setLanguage('es'); translateDOM(document);
    renderMemoryProgress(targets, 'GTPL', { ...progress, reading: false });
    assert.equal(document.querySelector('label span').textContent, 'Muestras');
    assert.equal(select.value, '3');
    assert.match(targets.status.textContent, /memoria 2\/3.*lectura terminada/);
    assert.equal(targets.bar.value, 0);
    assert.equal(targets.live.textContent, targets.status.textContent);
  } finally { dom.window.close(); setLanguage(original); }
});

test('completed grid charts and accessible labels re-render in either locale without changing samples', () => {
  const original = getLanguage(), oldDocument = globalThis.document;
  const dom = new JSDOM('<select id="grid-metric"><option value="frameP95Ms" selected>p95</option></select><div id="grid-chart"></div><table><tbody id="grid-table"></tbody></table>');
  globalThis.document = dom.window.document;
  const point = { cells: 16, columns: 4, rows: 4, fps: 60.5, frameP95Ms: 16.5, updatesPerSecond: 1000.5, frames: 20 };
  const runData = { samples: { a: [{ result: { grid: [point] } }], b: [{ result: { grid: [{ ...point, fps: 50.5 }] } }] } };
  const before = JSON.stringify(runData);
  const args = { runData, engines: { a: { name: 'A' }, b: { name: 'B' } }, pair: ['a', 'b'] };
  try {
    setLanguage('en'); renderGridCharts(args);
    assert.match(document.querySelector('svg > title').textContent, /versus total cells/);
    assert.match(document.querySelector('.sample-legend').textContent, /circle.*sample\(s\)/);
    assert.match(document.querySelector('#grid-table').textContent, /16 cells.*60\.5 fps.*16\.5 ms/);
    setLanguage('es'); renderGridCharts(args);
    assert.match(document.querySelector('svg > title').textContent, /frente a celdas totales/);
    assert.match(document.querySelector('.sample-legend').textContent, /círculo.*muestra\(s\)/);
    assert.match(document.querySelector('#grid-table').textContent, /16 celdas.*60,5 fps.*16,5 ms/);
    assert.equal(JSON.stringify(runData), before);
  } finally { globalThis.document = oldDocument; dom.window.close(); setLanguage(original); }
});

test('English and Spanish runners validate the same workload and preserve recorded phase identifiers', async () => {
  const original = getLanguage();
  const dom = new JSDOM('<div id="app"></div><p id="runner-status"></p>', { pretendToBeVisual: true });
  const keys = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'MutationObserver', 'DOMParser', 'requestAnimationFrame'];
  const previous = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) globalThis[key] = key === 'window' ? dom.window : key === 'requestAnimationFrame' ? dom.window.requestAnimationFrame.bind(dom.window) : dom.window[key];
  try {
    const { runMethod } = await import('../../docs/benchmarks/method-runner.js');
    const host = document.querySelector('#app'), status = document.querySelector('#runner-status');
    const runs = [];
    for (const language of ['en', 'es']) {
      setLanguage(language);
      const result = await runMethod({ method: 'for', size: 3, memory: false, cases: 32 }, 'vanilla', host, status);
      assert.equal(result.validated, true);
      assert.equal(host.childNodes.length, 0, 'runner cleanup removes its measured view');
      assert.match(status.textContent, language === 'en' ? /list after operations/ : /lista tras operaciones/);
      runs.push(result);
    }
    assert.deepEqual(runs[0].snapshots.map(s => ({ phase: s.phase, dom: s.dom })), runs[1].snapshots.map(s => ({ phase: s.phase, dom: s.dom })));
    assert.deepEqual(runs[0].workload, runs[1].workload);
    assert.deepEqual(Object.keys(runs[0].metrics), Object.keys(runs[1].metrics));
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    dom.window.close(); setLanguage(original);
  }
});


test('stored validation errors can change display language without changing the recorded error', () => {
  const original = getLanguage();
  try {
    setLanguage('es');
    let stored;
    try { gridSizes({ columns: 1, rows: 2, step: 1, levels: 1 }); } catch (error) { stored = error; }
    const recorded = stored.message;
    assert.equal(errorMessage(stored), 'Dimensiones del grid inválidas.');
    setLanguage('en');
    assert.equal(errorMessage(stored), 'Invalid grid dimensions.');
    assert.equal(stored.message, recorded);
  } finally { setLanguage(original); }
});
