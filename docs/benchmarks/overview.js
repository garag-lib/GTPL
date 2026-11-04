import { t, getLanguage, onLanguageChange, formatNumber } from './i18n.js';
import { overviewMetrics, engineNames, productionEngines } from './overview-catalog.js';
import { efficiencyScore } from './scores.js';

const $ = selector => document.querySelector(selector);
let data;
const number = value => formatNumber(value, { maximumFractionDigits: 2 });
const el = (tag, text, cls) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  return node;
};
const sorted = (rows, direction) => [...rows].sort((a, b) => {
  const validA = Number.isFinite(a.median) && a.median > 0, validB = Number.isFinite(b.median) && b.median > 0;
  if (!validA || !validB) return Number(validB) - Number(validA);
  return direction === 'higher' ? b.median - a.median : a.median - b.median;
});

export function renderOverview() {
  if (!data) return;
  const select = $('#overview-metric');
  const selected = select.value || 'heap-switch-64';
  const groups = {
    memory: t('JS memory', 'Memoria JS'), lists: t('Lists', 'Listas'), views: t('Views', 'Vistas'),
    ui: t('UI updates', 'Cambios de UI'), download: t('Code download', 'Descarga de código'), grid: 'Grid',
  };
  select.replaceChildren();
  for (const [id, label] of Object.entries(groups)) {
    const group = el('optgroup'); group.label = label;
    for (const def of overviewMetrics.filter(m => m.group === id)) {
      const option = el('option', def.title[getLanguage()]); option.value = def.id; group.append(option);
    }
    select.append(group);
  }
  select.value = selected;
  const def = overviewMetrics.find(m => m.id === selected);
  const rows = data.metrics.find(m => m.id === selected).values;
  $('#overview-meta').textContent = `${data.measuredAt.slice(0, 10)} · Chrome ${data.environment.browser.split('.')[0]} headless · ${data.samples} ${t('timing samples', 'muestras de tiempo')} / ${data.heapSamples} ${t('memory samples', 'de memoria')} · ${data.validSamples} ${t('validated', 'validadas')}`;
  const ranking = $('#overview-ranking'); ranking.replaceChildren();
  const head = el('div', undefined, 'ranking-row ranking-head');
  head.append(el('span', t('Engine', 'Motor')), el('span', t('Relative performance', 'Rendimiento relativo')), el('span', t('Score', 'Índice')), el('span', t('Measured', 'Medido'), 'ranking-value'));
  ranking.append(head);
  for (const row of sorted(rows, def.direction)) {
    const item = el('div', undefined, `ranking-row${row.engine === 'gtpl' ? ' gtpl' : ''}`);
    const score = efficiencyScore(row.median, rows.map(r => r.median), def.direction);
    const track = el('div', undefined, 'bar-track'), fill = el('div', undefined, 'bar-fill');
    fill.style.width = `${score ?? 0}%`; track.append(fill);
    const range = row.min === undefined ? '' : ` · ${t('range', 'rango')} ${number(row.min)}–${number(row.max)} ${def.unit}`;
    item.title = `${engineNames[row.engine]} ${data.versions[row.engine]} · n=${row.n}${range}`;
    item.append(el('span', engineNames[row.engine]), track, el('span', score === null ? '—' : number(score), 'ranking-score'), el('span', `${number(row.median)} ${def.unit}`, 'ranking-value'));
    ranking.append(item);
  }
  const gtpl = rows.find(r => r.engine === 'gtpl');
  const overlap = rows.filter(r => r.engine !== 'gtpl' && r.min !== undefined && gtpl.min !== undefined && r.max >= gtpl.min && r.min <= gtpl.max);
  const limits = def.phase === 'heap'
    ? t('JS heap after GC; excludes native DOM memory. Signed deltas are not total RAM.', 'Heap JS tras GC; excluye memoria nativa del DOM. Los deltas no son RAM total.')
    : def.phase === 'bundle'
      ? t('Entry + shared modules + case template. Gzip bytes, not minimum library size.', 'Entrada + módulos compartidos + plantilla del caso. Bytes gzip, no tamaño mínimo de la librería.')
      : def.group === 'grid'
        ? t('Same work per frame. Flutter waits for endOfFrame; DOM confirms changes + layout.', 'Mismo trabajo por frame. Flutter espera a endOfFrame; DOM confirma cambios + layout.')
        : t('DOM + layout. Downloads excluded. JIT compilation included in mount.', 'DOM + layout. Descarga excluida. Compilación JIT incluida al montar.');
  const unstable = rows.filter(r => r.minFrames < 12).map(r => engineNames[r.engine]);
  $('#overview-note').textContent = [limits,
    overlap.length ? t(`Ranges overlap GTPL: ${overlap.map(r => engineNames[r.engine]).join(', ')}.`, `Rangos solapados con GTPL: ${overlap.map(r => engineNames[r.engine]).join(', ')}.`) : '',
    unstable.length ? t(`Fewer than 12 frames: ${unstable.join(', ')}; unstable cadence.`, `Menos de 12 frames: ${unstable.join(', ')}; cadencia poco estable.`) : '',
  ].filter(Boolean).join(' ');

  const highlights = $('#overview-highlights'); highlights.replaceChildren();
  for (const [id, es, en] of [['heap-switch-64', '64 vistas · memoria JS', '64 views · JS memory'], ['edit-one', 'Editar una fila', 'Edit one row'], ['download-list', 'Descarga · listas', 'Download · lists'], ['list-mount', 'Montar 500 filas', 'Mount 500 rows']]) {
    const definition = overviewMetrics.find(m => m.id === id), values = data.metrics.find(m => m.id === id).values;
    const production = sorted(values.filter(r => productionEngines.includes(r.engine)), definition.direction);
    const rank = production.findIndex(r => r.engine === 'gtpl') + 1;
    const value = production[rank - 1];
    const card = el('button', undefined, 'overview-highlight'); card.type = 'button';
    card.append(el('span', t(en, es)), el('strong', value.median > 0 ? `${rank} / ${production.length}` : '—'), el('small', `${t('GTPL AOT rank', 'Puesto de GTPL AOT')} · ${number(value.median)} ${definition.unit}`));
    card.title = t('Position among six production frameworks, by median. Open the comparison for ranges.', 'Puesto entre seis frameworks de producción, por mediana. Abre la comparación para ver los rangos.');
    card.addEventListener('click', () => { select.value = id; renderOverview(); });
    highlights.append(card);
  }
  const details = $('#overview-details'); details.replaceChildren();
  const list = el('ul');
  for (const line of [
    t('Score: 100 × best time / measured time; for FPS, 100 × measured FPS / best FPS. Each test has its own scale. No overall score.', 'Índice: 100 × mejor tiempo / tiempo medido; para FPS, 100 × FPS medidos / mejores FPS. Cada prueba tiene su escala. Sin nota global.'),
    t('Card positions compare GTPL AOT, React, Svelte, Vue, Angular and Alpine. JIT and Vanilla remain visible in every chart. Positions are descriptive, not statistical significance.', 'Los puestos de las tarjetas comparan GTPL AOT, React, Svelte, Vue, Angular y Alpine. JIT y Vanilla siguen visibles en todas las gráficas. Los puestos son descriptivos, no significancia estadística.'),
    t('Local list edits: native reactive state; React uses immutable rows + memo. Full replacements: new row objects, native list reconciliation. All rows are validated after every operation.', 'Ediciones locales: estado reactivo nativo; React usa filas inmutables + memo. Reemplazos completos: objetos nuevos y reconciliación nativa. Se validan todas las filas tras cada operación.'),
    `${data.environment.cpu} · ${data.environment.cores} ${t('cores', 'núcleos')} · ${data.environment.viewport.width} × ${data.environment.viewport.height} · Node ${data.environment.node}`,
    Object.entries(data.versions).map(([id, version]) => `${engineNames[id]} ${version}`).join(' · '),
    `GTPL SHA256: ${data.sourceHash}`,
  ]) list.append(el('li', line));
  details.append(list);
  if (data.equivalence === 'gtpl-version-only') details.append(el('p', t(
    `GTPL was labeled ${data.measuredVersions.gtpl} when measured. Release ${data.versions.gtpl} has identical measured source, compiler settings, runners and bundle bytes (SHA-256 verified). Original samples are unchanged.`,
    `GTPL figuraba como ${data.measuredVersions.gtpl} al medir. La versión ${data.versions.gtpl} conserva las mismas fuentes, opciones, ejecutores y bytes medidos (SHA-256 verificados). Las muestras originales no se modifican.`)));
  const table = el('table'), body = el('tbody');
  const header = el('tr'); for (const text of [t('Engine', 'Motor'), t('Median', 'Mediana'), t('Range', 'Rango'), 'n']) header.append(el('th', text)); body.append(header);
  for (const row of rows) {
    const tr = el('tr'); for (const text of [engineNames[row.engine], `${number(row.median)} ${def.unit}`, row.min === undefined ? '—' : `${number(row.min)}–${number(row.max)}`, row.n]) tr.append(el('td', text)); body.append(tr);
  }
  table.append(body); const scroll = el('div', undefined, 'table-scroll'); scroll.append(table); details.append(scroll);
}

if ($('#overview')) {
  $('#overview-metric').addEventListener('change', renderOverview);
  onLanguageChange(renderOverview);
  Promise.all([fetch('benchmarks/results/latest.json').then(r => { if (!r.ok) throw Error(); return r.json(); }), fetch('benchmarks/manifest.json').then(r => r.json())])
    .then(async ([result, manifest]) => {
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(manifest)));
      const hash = [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
      if (result.sourceHash !== manifest.gtplSourceHash || result.manifestSHA256 !== hash) throw Error('Stale results');
      data = result; renderOverview();
    }).catch(() => { $('#overview-meta').textContent = t('Published results unavailable for this build. Run a live comparison below.', 'Resultados publicados no disponibles para este build. Ejecuta una comparación debajo.'); });
}
