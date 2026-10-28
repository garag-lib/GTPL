import assert from 'node:assert/strict';
import test from 'node:test';
import { GTpl } from '../src/GTpl';
import { BindTypes } from '../src/GEnums';
import { GProxy, unGProxy } from '../src/GProxy';

const settle = () => new Promise<void>(resolve => setImmediate(resolve));
type Probe = { path: string[]; read: (state: any) => unknown };

function observe(state: any, probes: Probe[]) {
  const root = { state };
  const nodes = probes.map(() => ({ textContent: '' }));
  const app = new GTpl({ root, generator: (ctx: GTpl) => {
    for (const [index, probe] of probes.entries()) ctx.addBind({ type: BindTypes.TEXT, ele: nodes[index], link: {
      formula: { vars: [['state', ...probe.path]], fnc(current: any) { return JSON.stringify(probe.read(current)); } }
    } } as any);
    return nodes;
  } });
  return { root, app, nodes };
}

const probes: Probe[] = [
  { path: ['rows', 'length'], read: state => state.rows.length },
  { path: ['rows'], read: state => Reflect.ownKeys(state.rows).map(String) },
  { path: ['record'], read: state => Object.keys(state.record) },
  { path: ['record', 'nested', 'name'], read: state => state.record.nested?.name ?? null },
  { path: ['groups', '0', 'items', 'length'], read: state => state.groups[0]?.items?.length ?? null },
  { path: ['groups', '0', 'items', '1'], read: state => state.groups[0]?.items?.[1] ?? null },
  ...Array.from({ length: 6 }, (_, index) => ({
    path: ['rows', String(index), 'name'], read: (state: any) => state.rows[index]?.name ?? null
  }))
];

function initial() {
  return { rows: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
    record: { nested: { name: 'old' } }, groups: [{ items: ['a', 'b', 'c'] }] };
}

test('ordinary mutations match native state and every dependent DOM value', async t => {
  const operations: [string, (state: any) => void][] = [
    ['push', state => { state.rows.push({ name: 'd' }, { name: 'e' }); }],
    ['pop', state => { state.rows.pop(); }],
    ['unshift', state => { state.rows.unshift({ name: 'z' }); }],
    ['shift', state => { state.rows.shift(); }],
    ['splice growth', state => { state.rows.splice(1, 1, { name: 'd' }, { name: 'e' }); }],
    ['splice shrink', state => { state.rows.splice(1, 2); }],
    ['reverse', state => { state.rows.reverse(); state.rows[0].name = 'renamed'; }],
    ['sort', state => { state.rows.sort((left: any, right: any) => right.name.localeCompare(left.name)); }],
    ['fill shared rows', state => { state.rows.fill({ name: 'shared' }); state.rows[1].name = 'changed'; }],
    ['copyWithin', state => { state.rows.copyWithin(1, 0, 2); state.rows[0].name = 'shared'; }],
    ['delete array slot', state => { delete state.rows[1]; }],
    ['truncate array length', state => { state.rows.length = 1; }],
    ['clear array length', state => { state.rows.length = 0; }],
    ['grow sparse length', state => { state.rows.length = 6; }],
    ['sparse undefined slot', state => { state.rows[5] = undefined; }],
    ['push undefined', state => { state.rows.push(undefined); }],
    ['create undefined object property', state => { state.record.missing = undefined; }],
    ['delete object property', state => { delete state.record.nested; }],
    ['replace nested object', state => { state.record.nested = { name: 'new' }; }],
    ['replace array', state => { state.rows = [{ name: 'new' }]; }],
    ['assign object fields', state => { Object.assign(state.record, { extra: 1, missing: undefined }); }],
    ['nested array push', state => { state.groups[0].items.push('d'); }],
    ['nested array truncate', state => { state.groups[0].items.length = 1; }],
    ['partial failed array truncation', state => {
      Object.defineProperty(state.rows, '1', { configurable: false });
      assert.equal(Reflect.set(state.rows, 'length', 0), false);
    }],
    ['nested array replace', state => { state.groups[0].items = ['new']; }],
    ['nested parent replace', state => { state.groups[0] = { items: ['new'] }; }],
    ['nested parent delete', state => { delete state.groups[0]; }]
  ];
  for (const [name, operation] of operations) await t.test(name, async () => {
    const expected = initial(), view = observe(initial(), probes);
    try {
      await view.app.ready();
      operation(expected); operation(view.root.state);
      await settle();
      assert.deepEqual(JSON.parse(JSON.stringify(view.root.state)), JSON.parse(JSON.stringify(expected)), 'State matches native mutation');
      assert.deepEqual(Reflect.ownKeys(view.root.state.rows), Reflect.ownKeys(expected.rows), 'Array holes and undefined slots match');
      assert.deepEqual(Reflect.ownKeys(view.root.state.record), Reflect.ownKeys(expected.record), 'Own undefined properties match');
      assert.deepEqual(view.nodes.map(node => node.textContent), probes.map(probe => JSON.stringify(probe.read(expected))), 'Every DOM dependency matches state');
    } finally {
      view.app.destroy(false);
    }
  });
});

test('mixed mutation batches keep DOM, own keys and native state consistent', async () => {
  let expected: any = initial();
  const view = observe(initial(), probes);
  let seed = 0x42ac9183;
  const operations = [
    (state: any, slot: number, step: number) => state.rows.push({ name: 'push-' + step }),
    (state: any) => state.rows.shift(),
    (state: any, slot: number, step: number) => { state.rows[slot] = { name: 'index-' + step }; },
    (state: any, slot: number) => { state.rows.length = slot; },
    (state: any, slot: number, step: number) => state.rows.splice(slot, 2, { name: 'splice-' + step }),
    (state: any) => state.rows.reverse(),
    (state: any, slot: number, step: number) => state.rows.fill({ name: 'shared-' + step }),
    (state: any, slot: number) => { delete state.rows[slot]; },
    (state: any, slot: number) => { state.record['optional' + slot] = undefined; },
    (state: any, slot: number, step: number) => { state.record.nested = { name: 'nested-' + step }; },
    (state: any) => { delete state.record.nested; },
    (state: any, slot: number, step: number) => { state.groups[0] ??= { items: [] }; state.groups[0].items.push('group-' + step); },
    (state: any, slot: number) => { state.groups[0] ??= { items: [] }; state.groups[0].items.length = slot; }
  ];
  try {
    await view.app.ready();
    for (let step = 0; step < 160; step++) {
      if (step && step % 31 === 0) { expected = initial(); view.root.state = initial(); }
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const operation = operations[seed % operations.length], slot = (seed >>> 8) % 6;
      operation(expected, slot, step); operation(view.root.state, slot, step);
      await settle();
      assert.deepEqual(JSON.parse(JSON.stringify(view.root.state)), JSON.parse(JSON.stringify(expected)), 'native state at step ' + step);
      assert.deepEqual(view.nodes.map(node => node.textContent), probes.map(probe => JSON.stringify(probe.read(expected))), 'DOM at step ' + step);
    }
  } finally { view.app.destroy(false); }
});

test('nested assignments can reuse raw identity retained after proxy revocation', async () => {
  const view = observe(initial(), probes);
  try {
    await view.app.ready();
    const previous = view.root.state.rows;
    view.root.state = initial();
    assert.throws(() => previous.length, TypeError);
    assert.doesNotThrow(() => { view.root.state.rows = previous; });
    view.root.state.rows.push({ name: 'reused' });
    await settle();
    assert.equal(view.nodes[0].textContent, '4');
    assert.equal(view.nodes[9].textContent, '"reused"');
  } finally { view.app.destroy(false); }
});

test('equal assignments preserve accessors, readonly failures and distinct receivers', () => {
  let calls = 0;
  const target = { data: 1, get accessor() { return 1; }, set accessor(value: number) { calls++; } };
  Object.defineProperty(target, 'fixed', { value: 1, writable: false });
  const event = () => {}, owner = {};
  const proxy = GProxy(target, event, owner);
  try {
    proxy.accessor = 1;
    assert.equal(calls, 1, 'An accessor setter still runs when its getter already returns that value');
    assert.equal(Reflect.set(proxy, 'fixed', 1), false);
    const receiver: any = {};
    assert.equal(Reflect.set(proxy, 'data', 1, receiver), true);
    assert.equal(receiver.data, 1);
    assert(Object.hasOwn(receiver, 'data'));
    proxy.data = 0;
    proxy.data = -0;
    assert(Object.is(target.data, -0), 'Signed zero assignments preserve the native value');
    proxy.data = NaN;
    proxy.data = NaN;
    assert(Number.isNaN(target.data));
  } finally { unGProxy(proxy, event, owner); }
});

test('shared array aliases keep independent dependency paths in one context', async () => {
  const shared: string[] = [];
  const view = observe({ left: shared, right: shared }, ['left', 'right'].map(key => ({
    path: [key, 'length'], read: (state: any) => state[key].length
  })));
  try {
    await view.app.ready();
    view.root.state.left.push('one');
    view.root.state.right.push('two');
    await settle(); assert.deepEqual(view.nodes.map(node => node.textContent), ['2', '2']);
    view.root.state.right.length = 0;
    await settle(); assert.deepEqual(view.nodes.map(node => node.textContent), ['0', '0']);
  } finally { view.app.destroy(false); }
});

test('shared arrays notify every subscribed context and stop after destruction', async () => {
  const shared: string[] = [];
  const probe = [{ path: ['rows', 'length'], read: (state: any) => state.rows.length }];
  const first = observe({ rows: shared }, probe), second = observe({ rows: shared }, probe);
  try {
    await Promise.all([first.app.ready(), second.app.ready()]);
    first.root.state.rows.push('one', 'two');
    await settle(); assert.deepEqual([first.nodes[0].textContent, second.nodes[0].textContent], ['2', '2']);
    first.app.destroy(false);
    second.root.state.rows.push('three');
    await settle(); assert.equal(second.nodes[0].textContent, '3');
  } finally {
    if (!first.app.isDestroyed) first.app.destroy(false);
    second.app.destroy(false);
  }
});
