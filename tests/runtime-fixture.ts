import assert from 'node:assert/strict';
import { BindTypes } from '../src/GEnums';
import { GTpl } from '../src/GTpl';

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// A small DOM fixture exercising the runtime's insertion and node-move paths.
export class TestNode {
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

export function boundText(app: GTpl, fnc: Function, vars: string[][] = []) {
  const node = new TestNode(3);
  app.addBind({ type: BindTypes.TEXT, ele: node, link: { formula: { fnc, vars } } });
  return node;
}

export function directive(app: GTpl, type: BindTypes, link: any, gen: Function) {
  const mark = new TestNode(8);
  app.addBind({ type, mark, link, gen });
  return mark;
}

export const flush = () => new Promise<void>(resolve => setImmediate(resolve));
