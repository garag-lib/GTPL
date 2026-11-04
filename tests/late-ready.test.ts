import assert from 'node:assert/strict';
import test from 'node:test';
import { createHook } from 'node:async_hooks';
import { BindTypes } from '../src/GEnums';
import { GTpl } from '../src/GTpl';
import { boundText, deferred, directive, flush, TestNode } from './runtime-fixture';

for (const inherited of [false, true]) {
  for (const outcome of ['resolve', 'reject before ready', 'reject after ready', 'destroy', 'replace']) {
    test(`late child ready tracks ${inherited ? 'inherited' : 'local'} data: ${outcome}`, async () => {
      const gates = [deferred<string>(), deferred<string>(), deferred<string>()];
      const root = { value: 0 };
      const parent = new GTpl({ generator: () => [], root: inherited ? root : {} });
      await parent.ready();
      let text!: TestNode;
      const child = new GTpl({ parent, root: inherited ? {} : root, context: inherited ? [] : ['value'],
        generator: (ctx: GTpl) => [text = boundText(ctx, (index: number) => gates[index].promise, [['value']])] });
      child.addTo(new TestNode() as any);
      try {
        const error = new Error('late initial failure');
        if (outcome === 'reject before ready') { await flush(); gates[0].reject(error); await flush(); }
        let settled = false;
        const ready = child.ready();
        ready.then(() => { settled = true; }, () => { settled = true; });
        if (outcome === 'reject before ready') {
          await assert.rejects(ready, e => e === error); return;
        }
        await flush();
        assert.equal(settled, false);
        assert.equal(text.textContent, '');
        assert.equal(parent.ready(), parent.ready());
        if (outcome === 'destroy') {
          child.destroy(); await assert.rejects(ready, /destroyed before ready/);
          gates[0].resolve('obsolete'); await flush(); assert.equal(text.textContent, '');
        } else if (outcome === 'reject after ready') {
          gates[0].reject(error); await assert.rejects(ready, e => e === error);
        } else if (outcome === 'replace') {
          root.value = 1; await flush(); root.value = 2; await flush();
          gates[0].resolve('obsolete 0'); gates[1].resolve('obsolete 1'); await flush();
          assert.equal(settled, false); assert.equal(text.textContent, '');
          gates[2].resolve('current'); await ready; assert.equal(text.textContent, 'current');
        } else {
          gates[0].resolve('done'); await ready; assert.equal(text.textContent, 'done');
        }
      } finally { if (!child.isDestroyed) child.destroy(); parent.destroy(); }
    });
  }
}

test('late generated descendants participate in their branch ready', async () => {
  const parent = new GTpl({ generator: () => [], root: {} }); await parent.ready();
  const gate = deferred<string>(); let text!: TestNode;
  const child = new GTpl({ parent, root: {}, generator: (ctx: GTpl) => [
    directive(ctx, BindTypes.IF, { formula: { fnc: () => true } },
      (row: GTpl) => [text = boundText(row, () => gate.promise)])
  ] });
  child.addTo(new TestNode() as any);
  try {
    let settled = false; const ready = child.ready().then(() => { settled = true; });
    await flush(); assert.equal(settled, false);
    gate.resolve('descendant'); await ready; assert.equal(text.textContent, 'descendant');
  } finally { child.destroy(); parent.destroy(); }
});

test('late child without ready does not allocate promises for later synchronous updates or refresh', async () => {
  const parent = new GTpl({ generator: () => [], root: { inherited: 1 } }); await parent.ready();
  const root = { value: 0 };
  const child = new GTpl({ parent, root, context: ['value'], generator: (ctx: GTpl) => [
    boundText(ctx, (value: number, inherited: number) => value + inherited, [['value'], ['inherited']])
  ] });
  await flush();
  let promises = 0;
  const hook = createHook({ init(_id, type) { if (type === 'PROMISE') promises++; } });
  try {
    // Install the completion callback before instrumentation to exclude the test harness.
    await new Promise<void>(resolve => {
      queueMicrotask(() => {
        hook.enable(); root.value = 2; parent.Root.inherited = 3;
        queueMicrotask(() => { hook.disable(); resolve(); });
      });
    });
    assert.equal(promises, 0);
  } finally { hook.disable(); child.destroy(); parent.destroy(); }
});
