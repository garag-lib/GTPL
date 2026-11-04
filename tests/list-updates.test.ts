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
    const raw = toRaw(root.rows); raw[1].label = 'same'; root.rows = raw;
    await flush(); assert.deepEqual(labels(), ['raw', 'same']);
    root.rows = []; await flush(); assert.deepEqual(labels(), []);
  } finally { app.destroy(); }
});
