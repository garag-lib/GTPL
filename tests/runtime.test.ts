import assert from 'node:assert/strict';
import test from 'node:test';

import { BindTypes, TypeEventProxyHandler } from '../src/GEnums';
import { GTpl } from '../src/GTpl';
import { css2obj, style2css } from '../src/GUtils';
import { GCompile, GCompileSafe } from '../src/GGenerator';
import { GProxy, unGProxy } from '../src/GProxy';

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

test('GCompileSafe only accepts precompiled generator functions', () => {
  const precompiled = (o: any) => [o];
  const generator = GCompileSafe(precompiled);
  assert.equal(generator, precompiled);
  assert.throws(() => GCompileSafe('(o)=>[]' as any), /precompiled generator function/);
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
