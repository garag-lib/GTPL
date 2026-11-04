import assert from 'node:assert/strict';
import test from 'node:test';
import { createHook } from 'node:async_hooks';
import { GTpl } from '../src/GTpl';
import { GProxy, unGProxy } from '../src/GProxy';
import { BindTypes } from '../src/GEnums';
import { boundText, flush, TestNode } from './runtime-fixture';

for (const count of [10, 100, 1000]) {
  test(`proxy unsubscribe preserves surviving owners across ${count} aliases`, () => {
    const shared = { nested: { value: 0 } };
    const target = Object.fromEntries(Array.from({ length: count }, (_, i) => [String(i), shared]));
    const a = {}, b = {}; const events: string[] = [];
    const event = (_type: any, path: any[], _value: any, owner: any) => events.push(`${owner === a ? 'a' : 'b'}:${path.join('.')}`);
    const proxy = GProxy(target, event, a);
    GProxy(target, event, b);
    for (let i = 0; i < count; i++) assert.equal(proxy[i].nested.value, 0);
    const nested = proxy[0].nested;
    unGProxy(proxy, event, a);
    nested.value = 1;
    assert.equal(events.length, count);
    assert.ok(events.every(path => path.startsWith('b:')));
    unGProxy(proxy, event, b);
    assert.throws(() => nested.value, TypeError);
  });
}

test('proxy index reuse preserves symbols, cycles, primitive owners and notification snapshots', () => {
  const symbol = Symbol('child'); const target: any = { [symbol]: { value: 0 } }; target.self = target;
  const a = {}, b = {}; const seen: any[] = [];
  const event = (_type: any, path: any[], _value: any, owner: any) => {
    seen.push([owner, path]);
    if (owner === a) unGProxy(target, event, a);
  };
  const proxy = GProxy(target, event, a); GProxy(target, event, b);
  assert.equal(proxy.self, proxy);
  const child = proxy[symbol];
  assert.equal(child, proxy[symbol]);
  child.value = 1;
  assert.ok(seen.some(([owner, path]) => owner === b && path[0] === symbol));
  assert.ok(seen.every(([, path]) => path.includes(symbol)));
  unGProxy(target, event, b);
  const raw = { nested: { value: 0 } }; let calls = 0;
  const primitiveEvent = () => { calls++; };
  const primitive = GProxy(raw, primitiveEvent, 'owner');
  for (let i = 0; i < 10; i++) void primitive.nested.value;
  primitive.nested.value = 1; assert.equal(calls, 1);
  // Primitive owners retain the original target-local removal contract.
  unGProxy(raw.nested, primitiveEvent, 'owner'); unGProxy(raw, primitiveEvent, 'owner');
});

test('watcher prefixes preserve order, dotted keys and subscriptions added during callbacks', () => {
  const app = new GTpl({ root: {}, generator: () => [] });
  const seen: string[] = [];
  for (const key of ['a.b.c', 'a.b', 'a', 'a.b.*', 'a.*', '*'])
    app.watch(key, () => { seen.push(key); if (key === 'a.b.c') app.watch('a', () => seen.push('late')); });
  app.eventPRoxy(0, ['a.b', 'c'], 1, { key: 'a.b' });
  assert.deepEqual(seen, ['a.b.c', 'a.b', 'a', 'late', 'a.b.*', 'a.*', '*']);
  app.destroy();
});

test('initial synchronous bindings share readiness bookkeeping without a promise per binding', async () => {
  let promises = 0; let app!: GTpl;
  const hook = createHook({ init(_id, type) { if (type === 'PROMISE') promises++; } });
  await new Promise<void>(resolve => queueMicrotask(() => {
    hook.enable();
    app = new GTpl({ root: { value: 1 }, generator: (ctx: GTpl) =>
      Array.from({ length: 100 }, () => boundText(ctx, (value: number) => value, [['value']])) });
    queueMicrotask(() => { hook.disable(); resolve(); });
  }));
  try { assert.equal(promises, 0); await app.ready(); }
  finally { hook.disable(); app.destroy(); }
});

test('synchronous switch and inherited refresh do not allocate update promises', async () => {
  const root = { selected: 'a', value: 0 };
  const parent = new GTpl({ root, generator: () => [] }); await parent.ready();
  const child = new GTpl({ parent, generator: (ctx: GTpl) => {
    const mark = new TestNode(8), a = new TestNode(8), b = new TestNode(8);
    ctx.addBind({ type: BindTypes.SWITCH, mark, link: { vorc: { va: ['selected'] } }, gen: () => [a, b],
      case: [a, b].map((mark, index) => ({ type: BindTypes.CASE, mark,
        link: { vorc: { ct: index ? 'b' : 'a' } }, gen: (ctx: GTpl) => [boundText(ctx, (value: number) => value, [['value']])] })) });
    return [mark];
  } });
  child.addTo(new TestNode() as any); await child.ready();
  let promises = 0;
  const hook = createHook({ init(_id, type) { if (type === 'PROMISE') promises++; } });
  await new Promise<void>(resolve => queueMicrotask(() => {
    hook.enable(); root.selected = 'b'; child.refresh();
    queueMicrotask(() => { hook.disable(); resolve(); });
  }));
  try { assert.equal(promises, 0); }
  finally { hook.disable(); child.destroy(); parent.destroy(); }
});
