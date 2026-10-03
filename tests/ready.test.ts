import assert from 'node:assert/strict';
import test from 'node:test';
import { BindTypes } from '../src/GEnums';
import { GTpl } from '../src/GTpl';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// A small DOM fixture exercising the runtime's insertion and node-move paths.
class TestNode {
  parentNode: TestNode | null = null;
  childNodes: TestNode[] = [];
  textContent = '';
  listeners = new Map<string, Function>();
  constructor(public nodeType = 1) { }
  appendChild(node: TestNode) { return this.insertBefore(node, null); }
  insertBefore(node: TestNode, mark: TestNode | null): TestNode {
    if (node.nodeType === 11) {
      [...node.childNodes].forEach(child => this.insertBefore(child, mark));
      return node;
    }
    node.remove();
    const index = mark ? this.childNodes.indexOf(mark) : this.childNodes.length;
    assert.ok(index >= 0, 'insertion mark belongs to the parent');
    this.childNodes.splice(index, 0, node);
    node.parentNode = this;
    return node;
  }
  removeChild(node: TestNode) {
    const index = this.childNodes.indexOf(node);
    assert.ok(index >= 0);
    this.childNodes.splice(index, 1);
    node.parentNode = null;
  }
  remove() { this.parentNode?.removeChild(this); }
  replaceChildren(node: TestNode) {
    [...this.childNodes].forEach(child => child.remove());
    this.appendChild(node);
  }
  addEventListener(type: string, fn: Function) { this.listeners.set(type, fn); }
  removeEventListener(type: string) { this.listeners.delete(type); }
}

function boundText(app: GTpl, fnc: Function, vars: string[][] = []) {
  const node = new TestNode(3);
  app.addBind({ type: BindTypes.TEXT, ele: node, link: { formula: { fnc, vars } } });
  return node;
}

function directive(app: GTpl, type: BindTypes, link: any, gen: Function) {
  const mark = new TestNode(8);
  app.addBind({ type, mark, link, gen });
  return mark;
}

test('ready waits for async initial bindings before moving nodes and retaining events', async () => {
  const value = deferred<number>();
  const container = new TestNode();
  const server = new TestNode(3);
  server.textContent = 'Counter: 5';
  container.appendChild(server);
  const fragment = new TestNode(11);
  const root = { count: 5 };
  let text!: TestNode;
  let button!: TestNode;
  const app = new GTpl({ root, generator: (ctx: GTpl) => {
    text = boundText(ctx, async (count: number) => {
      await value.promise;
      return `Counter: ${count}`;
    }, [['count']]);
    button = new TestNode();
    ctx.addBind({ type: BindTypes.EVENT, prop: 'click', ele: button,
      link: { formula: { fnc: function (this: typeof root) { this.count++; } } } });
    return [text, button];
  } });
  app.addTo(fragment as any);
  const ready = app.ready();
  assert.equal(ready, app.ready());
  let settled = false;
  ready.then(() => { settled = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  assert.equal(container.childNodes[0], server);
  value.resolve(5);
  await ready;
  assert.equal(text.textContent, 'Counter: 5');
  container.replaceChildren(fragment);
  assert.equal(container.childNodes[0], text);
  assert.equal(fragment.childNodes.length, 0);
  button.listeners.get('click')!({});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(root.count, 6);
  assert.equal(text.textContent, 'Counter: 6');
  app.destroy();
  assert.equal(button.listeners.size, 0);
});

test('ready follows nested g-for, g-if and g-is bindings launched in parent contexts', async () => {
  const gate = deferred<string>();
  const nodes: TestNode[] = [];
  const root = { rows: [{ visible: true }, { visible: false }], label: 'Ready', render: null as any };
  root.render = (ctx: GTpl) => {
    const node = boundText(ctx, async (label: string) => `${label}: ${await gate.promise}`, [['label']]);
    nodes.push(node);
    return [node];
  };
  const app = new GTpl({ root, generator: (ctx: GTpl) => [
    directive(ctx, BindTypes.FOR,
      { vorc: { va: ['rows'] }, index: { index: 'index', target: 'row' } },
      (row: GTpl) => [directive(row, BindTypes.IF, { vorc: { va: ['row', 'visible'] } },
        (visible: GTpl) => [directive(visible, BindTypes.IS,
          { vorc: { va: ['render'] } }, () => [])])])
  ] });
  const fragment = new TestNode(11);
  app.addTo(fragment as any);
  const ready = app.ready();
  let settled = false;
  ready.then(() => { settled = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(nodes.length, 1);
  assert.equal(settled, false);
  gate.resolve('done');
  await ready;
  assert.equal(nodes[0].textContent, 'Ready: done');
  assert.equal(nodes[0].parentNode, fragment);
  app.destroy();
});

test('ready follows asynchronous g-switch case bindings', async () => {
  const gate = deferred<string>();
  const caseMark = new TestNode(8);
  let text!: TestNode;
  const app = new GTpl({ root: { selected: 'a' }, generator: (ctx: GTpl) => {
    const mark = new TestNode(8);
    ctx.addBind({ type: BindTypes.SWITCH, mark,
      link: { vorc: { va: ['selected'] } }, gen: () => [caseMark],
      case: [{ type: BindTypes.CASE, mark: caseMark, link: { vorc: { ct: 'a' } },
        gen: (child: GTpl) => [text = boundText(child, () => gate.promise)] }] });
    return [mark];
  } });
  const fragment = new TestNode(11);
  app.addTo(fragment as any);
  const ready = app.ready();
  await new Promise(resolve => setImmediate(resolve));
  gate.resolve('case ready');
  await ready;
  assert.equal(text.textContent, 'case ready');
  assert.equal(text.parentNode, fragment);
  app.destroy();
});

test('ready preserves an initial rejection that occurs before it is called', async () => {
  const error = new Error('initial formula failed');
  const app = new GTpl({ root: {}, generator: (ctx: GTpl) => [
    boundText(ctx, () => Promise.reject(error))
  ] });
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(app.ready(), err => err === error);
  await assert.rejects(app.ready(), err => err === error);
  app.destroy();
});

test('ready rejects a nested failure even while another initial binding is pending', async () => {
  const error = new Error('child failed');
  const gate = deferred<string>();
  const app = new GTpl({ root: {}, generator: (ctx: GTpl) => [
    boundText(ctx, () => gate.promise),
    directive(ctx, BindTypes.IS, { formula: { fnc: () => (child: GTpl) => [
      boundText(child, () => Promise.reject(error))
    ] } }, () => [])
  ] });
  app.addTo(new TestNode(11) as any);
  await assert.rejects(app.ready(), err => err === error);
  app.destroy();
  gate.resolve('late result');
});

test('destroy rejects pending readiness and prevents a late DOM update', async () => {
  const gate = deferred<string>();
  let text!: TestNode;
  const app = new GTpl({ root: {}, generator: (ctx: GTpl) => [
    text = boundText(ctx, () => gate.promise)
  ] });
  app.addTo(new TestNode(11) as any);
  const ready = app.ready();
  app.destroy();
  await assert.rejects(ready, /destroyed before ready/);
  gate.resolve('late result');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(text.textContent, '');
});

test('ready covers an explicit initial refresh but does not wait for later refreshes', async () => {
  let value = Promise.resolve('initial');
  let text!: TestNode;
  const app = new GTpl({ root: {}, refresh: false, generator: (ctx: GTpl) => [
    text = boundText(ctx, () => value)
  ] });
  assert.equal(text.textContent, '');
  app.refresh();
  await app.ready();
  assert.equal(text.textContent, 'initial');
  const later = deferred<string>();
  value = later.promise;
  app.refresh();
  await app.ready();
  assert.equal(text.textContent, 'initial');
  later.resolve('later');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(text.textContent, 'later');
  app.destroy();
});

test('ready rejects DOM application errors and errors from generated children', async () => {
  const error = new Error('render failed');
  const app = new GTpl({ root: {}, generator: (ctx: GTpl) => {
    const node = boundText(ctx, () => 'value');
    Object.defineProperty(node, 'textContent', { set() { throw error; } });
    return [node];
  } });
  await assert.rejects(app.ready(), err => err === error);
  app.destroy();
  const child = new GTpl({ root: {}, generator: (ctx: GTpl) => [
    directive(ctx, BindTypes.IF, { formula: { fnc: () => true } }, () => { throw error; })
  ] });
  child.addTo(new TestNode(11) as any);
  await assert.rejects(child.ready(), err => err === error);
  child.destroy();
});

test('destroy while an async switch case is pending prevents generating a late child', async () => {
  const gate = deferred<string>();
  let generated = false;
  const app = new GTpl({ root: { selected: 'a' }, generator: (ctx: GTpl) => {
    const mark = new TestNode(8);
    const caseMark = new TestNode(8);
    ctx.addBind({ type: BindTypes.SWITCH, mark,
      link: { vorc: { va: ['selected'] } }, gen: () => [caseMark],
      case: [{ type: BindTypes.CASE, mark: caseMark,
        link: { formula: { fnc: () => gate.promise } },
        gen: () => { generated = true; return []; } }] });
    return [mark];
  } });
  const fragment = new TestNode(11);
  app.addTo(fragment as any);
  const ready = app.ready();
  await new Promise(resolve => setImmediate(resolve));
  app.destroy();
  await assert.rejects(ready, /destroyed before ready/);
  gate.resolve('a');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(generated, false);
  assert.equal(fragment.childNodes.length, 0);
});

test('ready resolves static templates and rejects an already destroyed instance', async () => {
  const app = new GTpl({ root: {}, generator: () => [] });
  await app.ready();
  app.destroy();
  const destroyed = new GTpl({ root: {}, generator: () => [] });
  destroyed.destroy();
  await assert.rejects(destroyed.ready(), /destroyed before ready/);
});
