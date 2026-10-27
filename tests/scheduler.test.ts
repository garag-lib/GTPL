import assert from 'node:assert/strict';
import test from 'node:test';
import { GTpl } from '../src/GTpl';
import { BindTypes, TypeEventProxyHandler } from '../src/GEnums';

const settle = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
function fixture(fnc: Function = (value: number) => value, vars = [['value']]) {
  let writes = 0, calculations = 0, current: any;
  const node = { get textContent() { return current; }, set textContent(value) { writes++; current = value; } };
  const root = { value: 0, other: 0 };
  let bind: any;
  const app = new GTpl({ root, generator: (ctx: GTpl) => {
    bind = { type: BindTypes.TEXT, ele: node, link: { formula: { vars, fnc(...values: any[]) { calculations++; return fnc(...values); } } } };
    ctx.addBind(bind);
    return [node];
  } });
  return { app, root, node, get bind() { return bind; }, get writes() { return writes; }, get calculations() { return calculations; }, reset() { writes = calculations = 0; } };
}

test('1000 synchronous changes preserve all state/watch events and calculate/write a binding once', async () => {
  const view = fixture();
  await view.app.ready(); view.reset();
  let events = 0;
  view.app.watch('value', () => events++);
  for (let i = 1; i <= 1000; i++) view.root.value = i;
  assert.equal(view.root.value, 1000);
  assert.equal(events, 1000);
  assert.equal(view.calculations, 0, 'calculation is deferred until the batch');
  await settle();
  assert.equal(view.calculations, 1);
  assert.equal(view.writes, 1);
  assert.equal(view.node.textContent, 1000);
  view.app.destroy(false);
});

test('sync bindings complete in the scheduled microtask and read final values of all dependencies', async () => {
  const view = fixture((a: number, b: number) => a + b, [['value'], ['other']]);
  await view.app.ready(); view.reset();
  view.root.value = 3; view.root.other = 7;
  await new Promise<void>(resolve => queueMicrotask(resolve));
  assert.equal(view.node.textContent, 10);
  assert.equal(view.calculations, 1);
  view.app.destroy(false);
});

test('a superseded asynchronous result cannot overwrite the latest DOM or block initial ready', async () => {
  const old = deferred<string>(), latest = deferred<string>();
  const view = fixture((value: number) => value === 0 ? old.promise : latest.promise);
  // Start the initial calculation before its replacement is queued.
  await new Promise<void>(resolve => queueMicrotask(resolve));
  view.root.value = 1;
  await new Promise<void>(resolve => queueMicrotask(resolve));
  latest.resolve('latest');
  await view.app.ready();
  assert.equal(view.node.textContent, 'latest');
  old.resolve('obsolete');
  await settle();
  assert.equal(view.node.textContent, 'latest');
  view.app.destroy(false);
});

test('destruction cancels a pending binding before its formula or DOM writes run', async () => {
  const view = fixture();
  await view.app.ready(); view.reset();
  view.root.value = 1;
  view.app.destroy(false);
  await settle();
  assert.equal(view.calculations, 0);
  assert.equal(view.writes, 0);
});

test('refresh and explicit launchChange share a binding job and preserve rejection/Promise API', async () => {
  const view = fixture();
  await view.app.ready(); view.reset();
  view.root.value = 4;
  view.app.refresh();
  const done = view.app.launchChange(TypeEventProxyHandler.FORCE_REFRESH_ROOT, view.bind);
  await done;
  assert.equal(view.calculations, 1);
  assert.equal(view.node.textContent, 4);
  view.app.destroy(false);
});

test('a stale rejection is observed without replacing the latest successful DOM', async () => {
  const old = deferred<string>();
  const view = fixture((value: number) => value === 0 ? old.promise : 'latest');
  await new Promise<void>(resolve => queueMicrotask(resolve));
  view.root.value = 1;
  await view.app.ready();
  old.reject(new Error('obsolete request'));
  await settle();
  assert.equal(view.node.textContent, 'latest');
  view.app.destroy(false);
});

test('a burst returning to the rendered value calculates once without a DOM write', async () => {
  const view = fixture(); await view.app.ready(); view.reset();
  view.root.value = 1; view.root.value = 0;
  await settle();
  assert.equal(view.calculations, 1);
  assert.equal(view.writes, 0);
  view.app.destroy(false);
});

test('one binding subscribed through parent and child contexts is deduplicated globally', async () => {
  const root = { count: 0 }, local = { value: 0 };
  let calculations = 0;
  const node = { textContent: '' };
  const parent = new GTpl({ root, generator: () => [] });
  const child = new GTpl({ parent, root: local, context: ['value'], generator: (ctx: GTpl) => {
    ctx.addBind({ type: BindTypes.TEXT, ele: node, link: { formula: {
      vars: [['count'], ['value']], fnc(count: number, value: number) { calculations++; return count + value; }
    } } });
    return [node];
  } });
  await child.ready(); calculations = 0;
  root.count = 2; local.value = 5;
  await settle();
  assert.equal(calculations, 1);
  assert.equal(node.textContent, 7);
  child.destroy(false); parent.destroy(false);
});

test('thenable calculations are awaited and public launches reject synchronous failures after ready', async () => {
  const view = fixture((value: number) => ({ then(resolve: Function) { resolve(value); } }));
  await view.app.ready(); view.root.value = 9;
  await settle(); assert.equal(view.node.textContent, 9);
  view.app.destroy(false);
  let broken = false;
  const failure = new Error('explicit refresh failed');
  const other = fixture(() => { if (broken) throw failure; return 0; });
  await other.app.ready(); broken = true;
  await assert.rejects(other.app.launchChange(TypeEventProxyHandler.FORCE_REFRESH_ROOT, other.bind), error => error === failure);
  other.app.destroy(false);
});

test('a synchronous automatic update after ready allocates no promises, including its flush', async () => {
  const { createHook } = await import('node:async_hooks');
  const view = fixture(); await view.app.ready(); view.reset();
  let promises = 0;
  const hook = createHook({ init(_id, type) { if (type === 'PROMISE') promises++; } });
  await new Promise<void>(resolve => {
    // Enable after this test's own awaiting promise has already been created.
    queueMicrotask(() => {
      hook.enable();
      view.root.value = 8;
      queueMicrotask(() => { hook.disable(); resolve(); });
    });
  });
  assert.equal(view.node.textContent, 8);
  assert.equal(view.calculations, 1);
  assert.equal(promises, 0);
  view.app.destroy(false);
});

test('automatic synchronous failures are reported once and do not abort other binding jobs', async () => {
  let broken = false;
  const error = new Error('automatic update failed');
  const view = fixture((value: number) => { if (broken) throw error; return value; });
  const other = fixture();
  await Promise.all([view.app.ready(), other.app.ready()]);
  const reported: any[] = [];
  const original = console.error;
  console.error = (...args) => { reported.push(args); };
  try {
    broken = true;
    for (let i = 1; i <= 10; i++) view.root.value = i;
    other.root.value = 3;
    await settle();
    assert.equal(reported.length, 1);
    assert.equal(reported[0][1], error);
    assert.equal(other.node.textContent, 3);
    broken = false; view.root.value = 11;
    await settle(); assert.equal(view.node.textContent, 11);
  } finally {
    console.error = original;
    view.app.destroy(false); other.app.destroy(false);
  }
});

test('a watcher may destroy its component before bindings are queued', async () => {
  const view = fixture(); await view.app.ready(); view.reset();
  view.app.watch('value', () => view.app.destroy(false));
  assert.doesNotThrow(() => { view.root.value = 1; });
  await settle();
  assert.equal(view.calculations, 0);
  assert.equal(view.writes, 0);
});

test('a synchronous formula invalidating itself cannot commit its obsolete value', async () => {
  let view: ReturnType<typeof fixture>;
  view = fixture((value: number) => {
    if (value === 1) view.root.value = 2;
    return value;
  });
  await view.app.ready(); view.reset();
  view.root.value = 1;
  await settle();
  assert.equal(view.root.value, 2);
  assert.equal(view.node.textContent, 2);
  assert.equal(view.calculations, 2);
  assert.equal(view.writes, 1);
  view.app.destroy(false);
});

test('direct bind-tree visitation selects changed leaves and preserves incoming paths', async () => {
  const root = { nested: { left: 0, right: 0 } };
  const nodes = [{ textContent: '' }, { textContent: '' }];
  const calls = [0, 0];
  const app = new GTpl({ root, generator: (ctx: GTpl) => {
    for (const [i, key] of ['left', 'right'].entries()) {
      ctx.addBind({ type: BindTypes.TEXT, ele: nodes[i], link: { formula: {
        vars: [['nested', key]], fnc(nested: any) { calls[i]++; return nested[key]; }
      } } });
    }
    return nodes;
  } });
  await app.ready(); calls.fill(0);
  root.nested.left = 1;
  const path = ['nested', 'left'];
  app.eventPRoxy(TypeEventProxyHandler.SET, path, 1, { key: 'nested' });
  await settle();
  assert.deepEqual(path, ['nested', 'left']);
  assert.deepEqual(calls, [1, 0]);
  assert.equal(nodes[0].textContent, 1);
  root.nested = { left: 2, right: 3 };
  await settle();
  assert.deepEqual(calls, [2, 1]);
  assert.deepEqual(nodes.map(node => node.textContent), [2, 3]);
  app.destroy(false);
});

test('an obsolete request stays obsolete after an idle period and a new asynchronous job', async () => {
  const old = deferred<string>(), current = deferred<string>();
  const view = fixture((value: number) => value === 0 ? old.promise : value === 1 ? 'first' : current.promise);
  await new Promise<void>(resolve => queueMicrotask(resolve));
  view.root.value = 1;
  await view.app.ready();
  assert.equal(view.node.textContent, 'first');
  // The binding becomes idle before the next job. Reusing a revision number
  // here would let the still-pending initial request commit into the new job.
  view.root.value = 2;
  await new Promise<void>(resolve => queueMicrotask(resolve));
  old.resolve('obsolete');
  await settle();
  assert.equal(view.node.textContent, 'first');
  current.resolve('latest');
  await settle();
  assert.equal(view.node.textContent, 'latest');
  view.app.destroy(false);
});
