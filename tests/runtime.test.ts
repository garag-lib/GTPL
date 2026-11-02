import assert from 'node:assert/strict';
import test from 'node:test';

import { BindTypes, TypeEventProxyHandler } from '../src/GEnums';
import { GTpl } from '../src/GTpl';
import { css2obj, style2css } from '../src/GUtils';
import { GCompile } from '../src/GGenerator';
import { GProxy, unGProxy, toRaw } from '../src/GProxy';

test('toRaw recovers raw identity after revocation without reviving the proxy', () => {
  const raw = { nested: { value: 1 } };
  const owner = {};
  const event = () => {};
  const proxy = GProxy(raw, event, owner);
  const nested = proxy.nested;
  unGProxy(proxy, event, owner);
  assert.throws(() => proxy.nested, TypeError);
  assert.throws(() => nested.value, TypeError);
  assert.equal(toRaw(proxy), raw);
  assert.equal(toRaw(nested), raw.nested);
  for (const value of [null, undefined, 0, 'text', Symbol('value'), () => {}, {}]) {
    assert.equal(toRaw(value), value);
  }
});

test('css2obj parses static and dynamic CSS values', () => {
  const css = "color:red;font-weight:bold;background-image:url('x;y');--my-var:10px";
  const parsed = css2obj(css);
  assert.deepStrictEqual(parsed, {
    color: 'red',
    fontWeight: 'bold',
    backgroundImage: "url('x;y')",
    '--my-var': '10px'
  });
});

test('css2obj preserves escaped quotes and semicolons inside strings', () => {
  const parsed = css2obj('content:"a\\\";b";color:red');
  assert.deepStrictEqual(parsed, {
    content: '"a\\\";b"',
    color: 'red'
  });
});

test('style2css transforms camelCase and preserves custom props', () => {
  assert.equal(style2css('fontWeight'), 'font-weight');
  assert.equal(style2css('--brand-color'), '--brand-color');
});

test('GTpl.eventPRoxy does not mutate received path', () => {
  const gtpl = new GTpl();
  gtpl.BindTree = { foo: {} };

  const path = ['foo', 'bar', 'baz'];
  gtpl.eventPRoxy(TypeEventProxyHandler.SET, path, 123, { key: 'foo' });

  assert.deepStrictEqual(path, ['foo', 'bar', 'baz']);
  gtpl.destroy(false);
});

test('GProxy preserves the path and context of every shared subscription', () => {
  const shared = { x: 0 };
  const ownerA = { key: 'a' };
  const ownerB = { key: 'b' };
  const seen: any[] = [];
  const eventA = (_type: any, path: any[], _value: any, objRef: any) => {
    seen.push({ listener: 'a', path: path.join('.'), key: objRef.key });
  };
  const eventB = (_type: any, path: any[], _value: any, objRef: any) => {
    seen.push({ listener: 'b', path: path.join('.'), key: objRef.key });
  };
  const proxyA = GProxy(shared, eventA, ownerA, ['a']);
  const proxyB = GProxy(shared, eventB, ownerB, ['b']);

  proxyB.x = 1;

  assert.equal(proxyA, proxyB);
  assert.deepStrictEqual(seen, [
    { listener: 'a', path: 'a.x', key: 'a' },
    { listener: 'b', path: 'b.x', key: 'b' }
  ]);
  unGProxy(proxyA, eventA, ownerA);
  unGProxy(proxyB, eventB, ownerB);
});

test('unGProxy removes nested subscriptions without affecting other owners', () => {
  const shared = { nested: { x: 0 } };
  const ownerA = { key: 'a' };
  const ownerB = { key: 'b' };
  const seen: string[] = [];
  const eventA = (_type: any, path: any[]) => seen.push(`a:${path.join('.')}`);
  const eventB = (_type: any, path: any[]) => seen.push(`b:${path.join('.')}`);
  const proxyA = GProxy(shared, eventA, ownerA, ['a']);
  const proxyB = GProxy(shared, eventB, ownerB, ['b']);
  const nested = proxyA.nested;

  assert.equal(nested, proxyA.nested);
  unGProxy(proxyA, eventA, ownerA);
  nested.x = 1;

  assert.deepStrictEqual(seen, ['b:b.nested.x']);
  unGProxy(proxyB, eventB);
  assert.throws(() => { nested.x = 2; }, TypeError);
});

test('GTpl disconnects the previous reactive tree when replacing a root value', async () => {
  const root = { value: { nested: { x: 1 } } };
  const element = { title: '' };
  const gtpl = new GTpl();
  gtpl.Root = root;
  gtpl.Elements = [];
  gtpl.addBind({
    type: BindTypes.ATTR,
    prop: 'title',
    ele: element,
    link: { vorc: { va: ['value', 'nested', 'x'] } }
  } as any);
  const oldValue = root.value;
  const oldNested = oldValue.nested;

  root.value = { nested: { x: 2 } };
  await new Promise(resolve => setImmediate(resolve));

  assert.throws(() => { oldNested.x = 3; }, TypeError);
  assert.doesNotThrow(() => { root.value.nested.x = 4; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(element.title, 4);
  gtpl.destroy(false);
});

test('GCompile builds runtime generator function', () => {
  const generator = GCompile('(o)=>[]');
  assert.equal(typeof generator, 'function');
  assert.deepStrictEqual(generator({}), []);
});

test('GTpl accepts precompiled AOT generators directly', async () => {
  const root = { value: 'initial' };
  const precompiled = (context: GTpl) => {
    const node = { textContent: '' };
    context.addBind({ type: BindTypes.TEXT, ele: node, link: { vorc: { va: ['value'] } } } as any);
    return [node];
  };
  const app = new GTpl({ root, generator: precompiled });
  const mounted: any[] = [];
  app.addTo(mounted);
  await app.ready();
  assert.equal(app.FncElements, precompiled);
  assert.equal(mounted[0].textContent, 'initial');
  root.value = 'updated';
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(mounted[0].textContent, 'updated');
  app.destroy(false);
});

test('GTpl.destroy removes DOM event listeners tracked on rendered elements', () => {
  const calls: any[] = [];
  const fakeElement: any = {
    attributes: [],
    addEventListener(type: string, handler: Function, options: any) {
      calls.push({ type: 'add', event: type, handler, options });
    },
    removeEventListener(type: string, handler: Function, options: any) {
      calls.push({ type: 'remove', event: type, handler, options });
    },
    parentNode: {
      removeChild() { }
    }
  };
  const gtpl = new GTpl();
  gtpl.Root = {};
  gtpl.Elements = [fakeElement];
  gtpl.addBind({
    type: BindTypes.EVENT,
    prop: 'click',
    ele: fakeElement,
    link: { vorc: { ct: 'ok' } }
  } as any);
  gtpl.destroy();
  assert.equal(calls.filter((c) => c.type === 'add').length, 1);
  assert.equal(calls.filter((c) => c.type === 'remove').length, 1);
});

test('GTpl.destroy cleans formula bindings split across parent and g-for contexts', () => {
  const parent = new GTpl();
  const child = new GTpl();
  const bind: any = {
    type: BindTypes.ATTR,
    link: {
      formula: {
        vars: [['path'], ['item', 'stallId']],
        fnc: () => ''
      }
    }
  };
  const parentBinds = new Set([bind]);
  const childBinds = new Set([bind]);

  parent.BindTree = { path: { me: parentBinds } };
  child.BindTree = {
    item: {
      tree: {
        stallId: { me: childBinds }
      }
    }
  };
  child.BindMap = new Map([[bind, parent]]);

  assert.doesNotThrow(() => child.destroy(false));
  assert.equal(parentBinds.size, 0);
  assert.equal(childBinds.size, 0);
});

test('unwatch remains safe to call after GTpl.destroy', () => {
  const gtpl = new GTpl();
  const unwatch = gtpl.watch('value', () => { });

  gtpl.destroy(false);

  assert.doesNotThrow(unwatch);
  assert.doesNotThrow(unwatch);
});

test('child cleanup can destroy its parent without disposing the child twice', () => {
  const parent = new GTpl({ root: {}, generator: () => [] });
  const child = new GTpl({ parent, generator: () => [] });
  parent.GtplChilds.add(child);
  let cleanups = 0, destroyedDuringCleanup = false;
  child.onCleanup(() => {
    cleanups++;
    destroyedDuringCleanup = child.isDestroyed;
    parent.destroy();
  });

  assert.doesNotThrow(() => child.destroy());
  assert.equal(cleanups, 1);
  assert.equal(destroyedDuringCleanup, true);
  assert.equal(parent.isDestroyed, true);
  assert.equal(child.isDestroyed, true);
  assert.equal(parent.GtplChilds.size, 0);
});

test('replacing or deleting nested proxy branches releases their subscriptions', () => {
  for (const mutation of ['replace', 'delete', 'truncate']) {
    const raw: any = mutation === 'truncate' ? [{ child: { value: 1 } }] : { branch: { child: { value: 1 } } };
    const owner = {};
    const event = () => {};
    const proxy: any = GProxy(raw, event, owner, ['root']);
    const branch = mutation === 'truncate' ? proxy[0] : proxy.branch;
    const child = branch.child;
    if (mutation === 'replace') proxy.branch = { child: { value: 2 } };
    else if (mutation === 'delete') delete proxy.branch;
    else proxy.length = 0;
    assert.throws(() => branch.child, TypeError, mutation);
    assert.throws(() => child.value, TypeError, mutation);
    unGProxy(proxy, event, owner);
  }
});

test('replacing one proxy branch preserves subscriptions through live aliases and owners', () => {
  const shared = { child: { value: 1 } };
  const raw = { left: shared, right: shared };
  const owner = {}, otherOwner = {};
  const seen: string[] = [];
  const event = (_type: any, path: any[]) => seen.push(path.join('.'));
  const proxy = GProxy(raw, event, owner, ['root']);
  const other = GProxy(shared, event, otherOwner, ['other']);
  const left = proxy.left.child;
  assert.equal(left, proxy.right.child);
  proxy.left = { child: { value: 0 } };
  seen.length = 0;
  left.value = 2;
  assert.deepStrictEqual(seen.sort(), ['other.child.value', 'root.right.child.value']);
  unGProxy(proxy, event, owner);
  assert.equal(other.child.value, 2);
  unGProxy(other, event, otherOwner);
});

test('unwatch releases its cleanup callback immediately', () => {
  const gtpl = new GTpl();
  for (let i = 0; i < 100; i++) {
    const off = gtpl.watch('value', () => {});
    off();
    off();
  }
  assert.equal(gtpl.watchers.size, 0);
  assert.equal(gtpl.cleanupCallbacks.size, 0);
  gtpl.destroy(false);
});

test('destroy restores ordinary root properties with their latest raw values', async () => {
  const root = { value: { name: 'Alice' } };
  const original = Object.getOwnPropertyDescriptor(root, 'value');
  const gtpl = new GTpl({ root, generator: () => [] });
  gtpl.addBind({ type: BindTypes.ATTR, prop: 'title', ele: { title: '' }, link: { vorc: { va: ['value', 'name'] } } } as any);
  await gtpl.ready();
  root.value.name = 'Bob';
  const raw = toRaw(root.value);
  gtpl.destroy(false);
  assert.equal(root.value, raw);
  assert.equal(root.value.name, 'Bob');
  assert.deepStrictEqual(Object.getOwnPropertyDescriptor(root, 'value'), { ...original, value: raw });
});

test('synchronous event expressions can cancel default behavior before dispatch returns', () => {
  const target = new EventTarget();
  const gtpl = new GTpl({ root: {}, generator: () => [target] });
  gtpl.addBind({ type: BindTypes.EVENT, prop: 'click', ele: target, link: { formula: { fnc: () => false } } } as any);
  const event = new Event('click', { cancelable: true });
  assert.equal(target.dispatchEvent(event), false);
  assert.equal(event.defaultPrevented, true);
  gtpl.destroy();
});

test('destroy unregisters inherited pipe parameter bindings', async () => {
  const parent = new GTpl({ root: { suffix: '!', format(suffix: string, value: string) { return value + suffix; } }, generator: () => [] });
  const child = new GTpl({ parent, root: { row: 'a' }, context: ['row'], generator: () => [] });
  const element = { title: '' };
  child.addBind({ type: BindTypes.ATTR, prop: 'title', ele: element, link: { vorc: { va: ['row'] }, functions: [{ name: ['format'], params: [{ va: ['suffix'] }] }] } } as any);
  await child.ready();
  assert.equal(element.title, 'a!');
  assert.equal(parent.BindTree.suffix.me.size, 1);
  child.destroy(false);
  assert.equal(parent.BindTree.suffix.me.size, 0);
  parent.destroy(false);
});

test('destroy releases listeners on descendants even when rendered elements are preserved', () => {
  let removals = 0;
  const target = new EventTarget();
  const remove = target.removeEventListener.bind(target);
  target.removeEventListener = (...args) => { removals++; remove(...args); };
  const gtpl = new GTpl({ root: {}, generator: () => [] });
  gtpl.addBind({ type: BindTypes.EVENT, prop: 'click', ele: target, link: { formula: { fnc: () => false } } } as any);
  gtpl.destroy(false);
  assert.equal(removals, 1);
  assert.equal(target.dispatchEvent(new Event('click', { cancelable: true })), true);
});

test('destroy never restores a reactive getter from an already destroyed view', async () => {
  for (const reverse of [false, true]) {
    const root = { value: { name: 'Alice' } };
    const apps = [0, 1].map(() => {
      const app = new GTpl({ root, generator: () => [] });
      app.addBind({ type: BindTypes.ATTR, prop: 'title', ele: { title: '' }, link: { vorc: { va: ['value', 'name'] } } } as any);
      return app;
    });
    await Promise.all(apps.map(app => app.ready()));
    if (reverse) apps.reverse();
    apps.forEach(app => app.destroy(false));
    assert.equal(root.value.name, 'Alice');
    assert.equal(Object.getOwnPropertyDescriptor(root, 'value')?.get, undefined);
  }
});

test('destroy restores an original accessor and transfers the last value to its setter', async () => {
  let value = { name: 'Alice' };
  const root = { get value() { return value; }, set value(next) { value = next; } };
  const descriptor = Object.getOwnPropertyDescriptor(root, 'value');
  const app = new GTpl({ root, generator: () => [] });
  app.addBind({ type: BindTypes.ATTR, prop: 'title', ele: { title: '' }, link: { vorc: { va: ['value', 'name'] } } } as any);
  await app.ready();
  root.value = { name: 'Bob' };
  app.destroy(false);
  assert.deepStrictEqual(Object.getOwnPropertyDescriptor(root, 'value'), descriptor);
  assert.equal(root.value.name, 'Bob');
});

test('array iterator subscriptions are released when their indexed rows are removed', () => {
  const owner = {}, event = () => {};
  const proxy = GProxy([{ value: 1 }], event, owner, ['rows']);
  const row = [...proxy][0];
  proxy.pop();
  assert.throws(() => row.value, TypeError);
  unGProxy(proxy, event, owner);
});

test('destroy clears owned g-bind and g-binds references', async () => {
  const first = {}, second = {};
  const root: any = { selected: null, refs: [] };
  const app = new GTpl({ root, generator: () => [] });
  app.addBind({ type: BindTypes.ELE, ele: first, link: { vorc: { va: ['selected'] } } } as any);
  app.addBind({ type: BindTypes.ELES, ele: first, link: { vorc: { va: ['refs'] } } } as any);
  app.addBind({ type: BindTypes.ELES, ele: second, link: { vorc: { va: ['refs'] } } } as any);
  await app.ready();
  assert.equal(root.selected, first);
  assert.deepStrictEqual(root.refs, [first, second]);
  app.destroy(false);
  assert.equal(root.selected, null);
  assert.deepStrictEqual(root.refs, []);
});

test('g-bind cleanup preserves a newer reference assigned to the same path', () => {
  const first = {}, second = {};
  const root: any = { selected: null };
  const app = new GTpl({ root, generator: () => [] });
  app.addBind({ type: BindTypes.ELE, ele: first, link: { vorc: { va: ['selected'] } } } as any);
  root.selected = second;
  app.destroy(false);
  assert.equal(root.selected, second);
});

test('a failing original setter does not abort destruction and proxy revocation', async () => {
  const value = { name: 'Alice' };
  const root = { get value() { return value; }, set value(_next) { throw new Error('setter failure'); } };
  const app = new GTpl({ root, generator: () => [] });
  app.addBind({ type: BindTypes.ATTR, prop: 'title', ele: { title: '' }, link: { vorc: { va: ['value', 'name'] } } } as any);
  await app.ready();
  const proxy = root.value;
  const errors: any[] = [], previous = console.error;
  console.error = (...args) => { errors.push(args); };
  try { assert.doesNotThrow(() => app.destroy(false)); } finally { console.error = previous; }
  assert.equal(errors.length, 1);
  assert.equal(app.BindDef.size, 0);
  assert.equal(app.Root, null);
  assert.throws(() => proxy.name, TypeError);
});
