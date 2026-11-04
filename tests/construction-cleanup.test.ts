import assert from 'node:assert/strict';
import test from 'node:test';
import { BindTypes } from '../src/GEnums';
import { GGenerator, GregisterDirective } from '../src/GGenerator';
import { GTpl } from '../src/GTpl';
import { boundText, flush, TestNode } from './runtime-fixture';

test('a failing directive releases partial construction and preserves its original error', async () => {
  const error = new Error('directive failed');
  const parent = new GTpl({ root: { value: { count: 1 } }, generator: () => [] });
  const host = new TestNode(); const node = new TestNode();
  let instance!: GTpl, nested: any, child!: GTpl, cleanup = 0;
  const unhandled: any[] = [];
  GregisterDirective('test-failing-construction', class {
    constructor(_ele: any, _value: any, ctx: GTpl) {
      instance = ctx;
      ctx.onCleanup(() => { cleanup++; });
      ctx.watch('local', () => {});
      ctx.addBind({ type: BindTypes.EVENT, prop: 'click', ele: node, link: { formula: { fnc: () => {} } } });
      boundText(ctx, (value: any) => value.count, [['value']]);
      nested = parent.Root.value;
      child = new GTpl({ parent: ctx, generator: (row: GTpl) => [boundText(row, () => 'child')] });
      ctx.GtplChilds.add(child); child.addTo(host as any);
      host.appendChild(node);
      throw error;
    }
  });
  try {
    assert.throws(() => new GTpl({ parent, root: { local: 0 }, context: ['local'], generator: (ctx: GTpl) => {
      GGenerator.addAttributes([['test-failing-construction', '']], node as any, ctx);
      return [node];
    } }), e => e === error);
    assert.equal(instance.isDestroyed, true);
    assert.equal(child.isDestroyed, true);
    assert.equal(cleanup, 1);
    assert.equal(node.listeners.size, 0);
    assert.equal(host.childNodes.length, 0);
    assert.equal(parent.BindTree.value.me.size, 0);
    nested.count++; await flush();
    assert.equal(cleanup, 1);
  } finally {
    if (instance && !instance.isDestroyed) instance.destroy();
    parent.destroy();
  }
});
