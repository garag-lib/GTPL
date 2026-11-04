import assert from 'node:assert/strict';
import test from 'node:test';
import { BindTypes, TypeEventProxyHandler } from '../src/GEnums';
import { GTpl } from '../src/GTpl';
import { toRaw } from '../src/GProxy';
import { boundText, directive, flush, TestNode } from './runtime-fixture';

function listFixture(transformed = false) {
  const root = { rows: [{ label: 'excluded', include: false }, { label: 'included', include: true }] };
  let bind: any;
  const app = new GTpl({ root, generator: (ctx: GTpl) => {
    const mark = new TestNode(8);
    bind = { type: BindTypes.FOR, mark, link: {
      ...(transformed ? { formula: { vars: [['rows']], fnc: (rows: any[]) => rows.filter(row => row.include) } }
        : { vorc: { va: ['rows'] } }),
      index: { index: 'index', target: 'row' }
    }, gen: (child: GTpl) => [boundText(child, (row: any) => row.label, [['row']])] };
    ctx.addBind(bind); return [mark];
  } });
  const host = new TestNode(); app.addTo(host as any);
  const labels = () => host.childNodes.filter(node => node.nodeType === 3).map(node => node.textContent);
  return { app, root, host, labels, bind };
}

test('filtered lists ignore source indices and reconcile membership, order and removal', async () => {
  const { app, root, labels, bind } = listFixture(true);
  try {
    await app.ready(); assert.deepEqual(labels(), ['included']);
    root.rows[1].label = 'changed';
    await app.launchChange(TypeEventProxyHandler.SET, bind, ['1', 'label']);
    assert.deepEqual(labels(), ['changed']);
    root.rows[0].include = true; await flush();
    assert.deepEqual(labels(), ['excluded', 'changed']);
    root.rows.reverse(); await flush();
    assert.deepEqual(labels(), ['changed', 'excluded']);
    root.rows[0].include = false; await flush();
    assert.deepEqual(labels(), ['excluded']);
    root.rows[1].include = false; await flush(); assert.deepEqual(labels(), []);
  } finally { app.destroy(); }
});

test('direct lists preserve final rows across mixed writes, raw refresh and same-reference assignment', async () => {
  const { app, root, labels } = listFixture();
  try {
    await app.ready();
    root.rows[0].label = 'nested'; root.rows.push({ label: 'pushed', include: true });
    root.rows.splice(1, 1); root.rows[1] = { label: 'replaced', include: true };
    await flush(); assert.deepEqual(labels(), ['nested', 'replaced']);
    toRaw(root.rows)[0].label = 'raw'; app.refresh(); await flush();
    assert.deepEqual(labels(), ['raw', 'replaced']);
    const first = toRaw(root.rows[0]); first.label = 'raw row'; root.rows[0] = first;
    await flush(); assert.deepEqual(labels(), ['raw row', 'replaced']);
    const raw = toRaw(root.rows); raw[1].label = 'same'; root.rows = raw;
    await flush(); assert.deepEqual(labels(), ['raw row', 'same']);
    root.rows = []; await flush(); assert.deepEqual(labels(), []);
  } finally { app.destroy(); }
});

test('row getters depending on other rows retain full reconciliation without extra getter evaluation', async () => {
  const { app, root, labels } = listFixture();
  try {
    await app.ready();
    let reads = 0;
    Object.defineProperty(toRaw(root.rows)[0], 'label', { configurable: true, enumerable: true,
      get() { reads++; return root.rows[1].label; } });
    app.refresh(); await flush(); reads = 0;
    root.rows[1].label = 'getter dependency';
    await flush();
    assert.deepEqual(labels(), ['getter dependency', 'getter dependency']);
    assert.equal(reads, 1, 'descriptor classification must not invoke the getter');
  } finally { app.destroy(); }
});

test('assigning a row with getters invalidates ordinary-list classification', async () => {
  const { app, root, labels } = listFixture();
  try {
    await app.ready();
    root.rows[0] = { include: true, get label() { return root.rows[1].label; } };
    await flush(); root.rows[1].label = 'getter row'; await flush();
    assert.deepEqual(labels(), ['getter row', 'getter row']);
  } finally { app.destroy(); }
});

test('changes in many ordinary rows only evaluate affected row bindings', async () => {
  let calculations = 0, events = 0;
  const root = { rows: Array.from({ length: 1000 }, (_, i) => ({ label: String(i) })) };
  const app = new GTpl({ root, generator: (ctx: GTpl) => [
    directive(ctx, BindTypes.FOR, { vorc: { va: ['rows'] }, index: { index: 'i', target: 'row' } },
      (row: GTpl) => [boundText(row, (value: any) => { calculations++; return value.label; }, [['row']])])
  ] });
  app.addTo(new TestNode() as any);
  try {
    await app.ready(); calculations = 0;
    app.watch('rows', () => { events++; });
    for (let i = 0; i < 100; i++) root.rows[i * 10].label = 'updated';
    await flush();
    assert.equal(calculations, 100);
    assert.equal(events, 100);
  } finally { app.destroy(); }
});
