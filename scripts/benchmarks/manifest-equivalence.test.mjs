import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { compareManifests, compareRunner } from './manifest-equivalence.mjs';

const measured = { gtplSourceHash: 'source', gtplCompiler: { optimized: true },
  frameworks: { gtpl: { version: '3.0.0', sha256: 'same' }, react: { version: '19', sha256: 'react' } },
  gridFrameworks: { 'gtpl-jit': { version: '3.0.0', sha256: 'jit' } },
  methods: { for: { gtpl: { version: '3.0.0', assets: [{ sha256: 'method', bytes: 100 }] } } } };
test('version promotion requires opt-in and byte-identical measured assets', () => {
  const next = structuredClone(measured);
  next.frameworks.gtpl.version = next.gridFrameworks['gtpl-jit'].version = next.methods.for.gtpl.version = '3.1.0';
  assert.equal(compareManifests(measured, measured), 'exact');
  assert.throws(() => compareManifests(measured, next));
  assert.equal(compareManifests(measured, next, true), 'gtpl-version-only');
  assert.equal(measured.frameworks.gtpl.version, '3.0.0');
  for (const change of [
    m => m.gtplSourceHash = 'different', m => m.gtplCompiler.optimized = false,
    m => m.methods.for.gtpl.assets[0].sha256 = 'different',
    m => m.methods.for.gtpl.assets[0].bytes++, m => m.frameworks.react.version = '20',
  ]) { const bad = structuredClone(next); change(bad); assert.throws(() => compareManifests(measured, bad, true)); }
});

test('removing a contender preserves strict checks for every retained bundle', () => {
  const original = structuredClone(measured);
  for (const group of [original.frameworks, original.gridFrameworks, original.methods.for])
    group.vanilla = { version: 'manual', sha256: 'removed' };
  assert.throws(() => compareManifests(original, measured));
  assert.equal(compareManifests(original, measured, false, ['vanilla']), 'exact');
  assert.ok(original.frameworks.vanilla, 'original measurement is immutable');
  assert.throws(() => compareManifests(original, original, true, ['vanilla']));
  const changed = structuredClone(measured);
  changed.frameworks.react.sha256 = 'changed';
  assert.throws(() => compareManifests(original, changed, true, ['vanilla']));
  delete changed.frameworks.react;
  assert.throws(() => compareManifests(original, changed, true, ['vanilla']));
});

test('runner selection exception rejects any change to measurement code', () => {
  const original = 'const allowed = [\n  "vanilla",\n  "flutter",\n];\nmeasure();\n';
  const current = original.replace('  "vanilla",\n', '');
  const hash = createHash('sha256').update(original).digest('hex');
  assert.equal(compareRunner('runner.js', original, hash), 'exact');
  assert.equal(compareRunner('runner.js', current, hash, ['vanilla']), 'engine-allow-list-only');
  assert.throws(() => compareRunner('runner.js', current, hash));
  assert.throws(() => compareRunner('method-runner.js', current, hash, ['vanilla']));
  assert.throws(() => compareRunner('runner.js', current.replace('measure()', 'altered()'), hash, ['vanilla']));
});
