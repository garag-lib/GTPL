import assert from 'node:assert/strict';
import test from 'node:test';
import { GTpl } from '../src/GTpl';
import { boundText, flush } from './runtime-fixture';

const orders = [
  ['grand', 'parent', 'local'], ['grand', 'local', 'parent'],
  ['parent', 'grand', 'local'], ['parent', 'local', 'grand'],
  ['local', 'grand', 'parent'], ['local', 'parent', 'grand']
];

for (const order of orders) {
  test(`destroy releases every inherited binding: ${order.join(', ')}`, async () => {
    const grand = new GTpl({ generator: () => [], root: { grand: 1 } });
    const parent = new GTpl({ generator: () => [], parent: grand, root: { parent: 2 }, context: ['parent'] });
    try {
      for (let cycle = 0; cycle < 24; cycle++) {
        let text: any;
        const child = new GTpl({ parent, root: { local: 3 }, context: ['local'],
          generator: (ctx: GTpl) => [text = boundText(ctx, (...args: number[]) => args.reduce((a, b) => a + b, 0), order.map(key => [key]))] });
        await child.ready();
        assert.equal(text.textContent, 6);
        grand.Root.grand = 2; parent.Root.parent = 3; child.Root.local = 4;
        await flush();
        assert.equal(text.textContent, 9);
        child.destroy();
        assert.equal(grand.BindTree.grand.me.size, 0);
        assert.equal(parent.BindTree.parent.me.size, 0);
        grand.Root.grand = 1; parent.Root.parent = 2;
        await flush();
        assert.equal(text.textContent, 9);
      }
    } finally { parent.destroy(); grand.destroy(); }
  });
}

for (const reentrant of ['cleanup', 'watcher']) {
  test(`destroy preserves live siblings and ${reentrant} reactions`, async () => {
    const grand = new GTpl({ generator: () => [], root: { grand: 1 } });
    const parent = new GTpl({ generator: () => [], parent: grand, root: { parent: 2 }, context: ['parent'] });
    const texts: any[] = [];
    const makeChild = () => new GTpl({ parent, root: { local: 3 }, context: ['local'],
      generator: (ctx: GTpl) => {
        const text = boundText(ctx, (a: number, b: number, c: number) => a + b + c, orders[0].map(key => [key]));
        texts.push(text); return [text];
      } });
    const removed = makeChild(), survivor = makeChild();
    try {
      await Promise.all([removed.ready(), survivor.ready()]);
      let cleanups = 0;
      removed.onCleanup(() => { cleanups++; if (reentrant === 'cleanup') grand.Root.grand++; });
      if (reentrant === 'watcher') {
        grand.watch('grand', () => removed.destroy());
        grand.Root.grand++;
      } else removed.destroy();
      await flush();
      assert.equal(cleanups, 1);
      assert.equal(texts[0].textContent, 6);
      assert.equal(texts[1].textContent, 7);
      assert.equal(grand.BindTree.grand.me.size, 1);
      assert.equal(parent.BindTree.parent.me.size, 1);
      survivor.destroy();
      assert.equal(grand.BindTree.grand.me.size, 0);
      assert.equal(parent.BindTree.parent.me.size, 0);
    } finally {
      if (!removed.isDestroyed) removed.destroy();
      if (!survivor.isDestroyed) survivor.destroy();
      parent.destroy(); grand.destroy();
    }
  });
}
