import assert from 'node:assert/strict';
import test from 'node:test';

import { BindTypes, TypeEventProxyHandler } from '../src/GEnums';
import { GTpl } from '../src/GTpl';
import { css2obj, style2css } from '../src/GUtils';
import { GCompile, GCompileSafe } from '../src/GGenerator';

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
