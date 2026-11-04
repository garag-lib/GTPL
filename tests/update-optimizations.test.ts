import assert from 'node:assert/strict';
import test from 'node:test';
import { BindTypes } from '../src/GEnums';
import { GTpl } from '../src/GTpl';
import { GProxy, isGProxy, replaceGProxy, toRaw, unGProxy } from '../src/GProxy';
import { boundText, directive, flush, TestNode } from './runtime-fixture';

test('first inherited binding registers one descriptor and emits one watcher notification', async () => {
  const root = { attrs: { title: 'initial' } };
  const parent = new GTpl({ root, generator: () => [] });
  const middle = new GTpl({ parent, generator: () => [] });
  const child = new GTpl({ parent: middle, generator: ctx => [
    boundText(ctx as GTpl, attrs => attrs.title, [['attrs']])
  ] });
  const host = new TestNode(); child.addTo(host as any);
  const calls: string[] = [];
  parent.watch('attrs.title', info => calls.push(info.value));
  try {
    await child.ready();
    assert.equal(parent.BindDef.size, 1);
    root.attrs.title = 'nested'; await flush();
    assert.deepEqual(calls, ['nested']);
    assert.equal(host.childNodes[0].textContent, 'nested');
    const old = root.attrs;
    root.attrs = { title: 'replacement' }; await flush();
    assert.throws(() => old.title, TypeError, 'replacement retires every old subscription');
    root.attrs.title = 'new nested'; await flush();
    assert.deepEqual(calls, ['nested', 'new nested']);
    child.destroy(); middle.destroy();
    root.attrs.title = 'after child'; await flush();
    assert.deepEqual(calls, ['nested', 'new nested', 'after child']);
    assert.equal(host.childNodes.length, 0);
  } finally {
    if (!child.isDestroyed) child.destroy();
    if (!middle.isDestroyed) middle.destroy();
    parent.destroy();
  }
  assert.deepEqual(Object.getOwnPropertyDescriptor(root, 'attrs'), {
    configurable: true, enumerable: true, writable: true, value: { title: 'after child' }
  });
});

test('inherited observers sharing a raw value survive another owning view being destroyed', async () => {
  const shared = { title: 'initial' };
  const first = new GTpl({ root: { attrs: shared }, generator: () => [] });
  const second = new GTpl({ root: { attrs: shared }, generator: () => [] });
  const children = [first, second].map(parent => new GTpl({ parent, generator: ctx => [
    boundText(ctx as GTpl, attrs => attrs.title, [['attrs']])
  ] }));
  const hosts = children.map(child => { const host = new TestNode(); child.addTo(host as any); return host; });
  const calls: string[] = [];
  second.watch('attrs.title', info => calls.push(info.value));
  try {
    await Promise.all(children.map(child => child.ready()));
    const proxy = second.Root.attrs;
    first.destroy();
    proxy.title = 'survivor'; await flush();
    assert.deepEqual(calls, ['survivor']);
    assert.equal(hosts[1].childNodes[0].textContent, 'survivor');
    second.destroy();
    assert.throws(() => proxy.title, TypeError);
  } finally {
    if (!first.isDestroyed) first.destroy();
    if (!second.isDestroyed) second.destroy();
  }
});

class AttributeNode extends TestNode {
  title: string | null = '';
  values = new Map<string, string>();
  setAttribute(key: string, value: any) { this.values.set(key, String(value)); }
  getAttribute(key: string) { return this.values.get(key) ?? null; }
  removeAttribute(key: string) { this.values.delete(key); }
}

function attributesFixture(attrs: any) {
  const root = { attrs };
  const node = new AttributeNode();
  const app = new GTpl({ root, generator: ctx => {
    ctx.addBind({ type: BindTypes.ATTR, ele: node, link: { vorc: { va: ['attrs'] } } });
    return [node];
  } });
  app.addTo(new TestNode() as any);
  return { app, root, node };
}

test('attribute enumeration preserves inherited keys, getter receivers and dynamic removal', async () => {
  const symbol = Symbol('ignored');
  const attrs = Object.create({ 'data-inherited': 'prototype' });
  let reads = 0;
  Object.assign(attrs, { 'data-value': 'one', [symbol]: 'hidden' });
  Object.defineProperty(attrs, 'title', { enumerable: true, configurable: true, get() {
    reads++; assert.ok(isGProxy(this), 'values must still be read through the reactive receiver');
    return this['data-value'];
  } });
  Object.defineProperty(attrs, 'data-hidden', { value: 'hidden', enumerable: false });
  const { app, root, node } = attributesFixture(attrs);
  try {
    await app.ready();
    assert.equal(reads, 1); assert.equal(node.title, 'one');
    assert.equal(node.getAttribute('data-inherited'), 'prototype');
    assert.equal(node.getAttribute('data-hidden'), null);
    reads = 0; root.attrs['data-value'] = 'two'; await flush();
    assert.equal(reads, 1); assert.equal(node.title, 'two');
    root.attrs = { 'data-new': 'replacement' }; await flush();
    assert.equal(node.title, null);
    assert.equal(node.getAttribute('data-value'), null);
    assert.equal(node.getAttribute('data-inherited'), null);
    assert.equal(node.getAttribute('data-new'), 'replacement');
    delete root.attrs['data-new']; await flush();
    assert.equal(node.getAttribute('data-new'), null);
    root.attrs = { title: 'last', 'data-extra': 'present' }; await flush();
    root.attrs = null; await flush();
    assert.equal(node.title, null); assert.equal(node.values.size, 0);
  } finally { app.destroy(); }
});

test('attribute refresh observes raw edits, same-reference assignment and external DOM changes', async () => {
  const { app, root, node } = attributesFixture({ title: 'initial', 'data-state': 'one' });
  try {
    await app.ready();
    const raw = toRaw(root.attrs);
    raw.title = 'raw'; delete raw['data-state']; raw['data-added'] = 'added';
    app.refresh(); await flush();
    assert.equal(node.title, 'raw'); assert.equal(node.getAttribute('data-state'), null);
    assert.equal(node.getAttribute('data-added'), 'added');
    raw.title = 'same reference'; root.attrs = raw; await flush();
    assert.equal(node.title, 'same reference');
    node.title = 'external'; node.setAttribute('data-added', 'external');
    app.refresh(); await flush();
    assert.equal(node.title, 'same reference'); assert.equal(node.getAttribute('data-added'), 'added');
  } finally { app.destroy(); }
});

test('whole-list replacement keeps contexts and nodes while the first partial change handles getters', async () => {
  const root: { rows: { label: string }[] } = { rows: [{ label: 'A' }, { label: 'B' }] };
  const contexts: GTpl[] = [];
  let calculations = 0;
  const app = new GTpl({ root, generator: ctx => [
    directive(ctx as GTpl, BindTypes.FOR, { vorc: { va: ['rows'] }, index: { index: 'i', target: 'row' } }, child => {
      contexts.push(child);
      return [boundText(child, row => { calculations++; return row.label; }, [['row']])];
    })
  ] });
  const host = new TestNode(); app.addTo(host as any);
  const labels = () => host.childNodes.filter(node => node.nodeType === 3).map(node => node.textContent);
  try {
    await app.ready(); const nodes = host.childNodes.slice(); const owners = [...contexts];
    root.rows = [{ label: 'C' }, { label: 'D' }]; await flush();
    assert.deepEqual(contexts, owners); assert.deepEqual(host.childNodes, nodes);
    calculations = 0; root.rows[1].label = 'partial'; await flush();
    assert.deepEqual(labels(), ['C', 'partial']); assert.equal(calculations, 1);
    root.rows = [{ get label() { return root.rows[1].label; } }, { label: 'getter' }]; await flush();
    root.rows[1].label = 'dependent'; await flush();
    assert.deepEqual(labels(), ['dependent', 'dependent']);
    root.rows = [{ label: 'E' }, { label: 'F' }]; await flush();
    toRaw(root.rows)[0].label = 'raw'; root.rows = toRaw(root.rows); await flush();
    assert.deepEqual(labels(), ['raw', 'F']);
    root.rows[0].label = 'nested'; root.rows.push({ label: 'append' }); await flush();
    assert.deepEqual(labels(), ['nested', 'F', 'append']);
    root.rows.splice(1, 2); await flush(); assert.deepEqual(labels(), ['nested']);
    assert.equal(contexts[0], owners[0]); assert.ok(owners[1].isDestroyed);
  } finally { app.destroy(); }
});

test('reactive replacements retire nested proxies, preserve other owners and handle static transitions', async () => {
  const shared = { nested: { label: 'shared' } };
  const firstRoot: any = { row: shared }, secondRoot: any = { row: shared };
  const first = new GTpl({ root: firstRoot, generator: ctx => [boundText(ctx as GTpl, row => row?.nested?.label ?? '', [['row']])] });
  const second = new GTpl({ root: secondRoot, generator: ctx => [boundText(ctx as GTpl, row => row?.nested?.label ?? '', [['row']])] });
  const seen: string[] = []; second.watch('row.nested.label', info => seen.push(info.value));
  try {
    await Promise.all([first.ready(), second.ready()]);
    const sharedProxy = firstRoot.row.nested;
    firstRoot.row = { nested: { label: 'replacement' } }; await flush();
    sharedProxy.label = 'surviving owner'; await flush();
    assert.deepEqual(seen, ['surviving owner']);
    assert.equal(first.Elements[0].textContent, 'replacement');
    assert.equal(second.Elements[0].textContent, 'surviving owner');
    const oldNested = firstRoot.row.nested;
    const raw = toRaw(firstRoot.row); raw.nested = { label: 'raw nested' };
    firstRoot.row = raw; await flush();
    assert.throws(() => oldNested.label, TypeError);
    assert.equal(first.Elements[0].textContent, 'raw nested');
    firstRoot.row = null; await flush(); assert.equal(first.Elements[0].textContent, '');
    firstRoot.row = { nested: { label: 'object again' } }; await flush();
    firstRoot.row.nested.label = 'reactive again'; await flush();
    assert.equal(first.Elements[0].textContent, 'reactive again');
    second.destroy(); assert.throws(() => sharedProxy.label, TypeError);
  } finally {
    first.destroy(); if (!second.isDestroyed) second.destroy();
  }
});

test('replacement index retention is released after failure and reentrant replacement', () => {
  const owner = {}, original = { nested: { value: 1 } }, next = { value: 2 };
  let calls = 0;
  const event = () => { calls++; };
  const first = GProxy(original, event, owner, ['row']);
  const nested = first.nested;
  assert.throws(() => replaceGProxy(original, event, owner, 'row', () => { throw Error('replacement failed'); }), /replacement failed/);
  assert.throws(() => nested.value, TypeError);
  const second = GProxy(next, event, owner, ['row']);
  second.value = 3; assert.equal(calls, 1);
  const final = { value: 4 };
  const third = replaceGProxy(next, event, owner, 'row', () =>
    replaceGProxy(next, event, owner, 'row', () => GProxy(final, event, owner, ['row'])));
  assert.throws(() => second.value, TypeError);
  third.value = 5; assert.equal(calls, 2);
  unGProxy(final, event, owner);
  assert.throws(() => third.value, TypeError);
});
