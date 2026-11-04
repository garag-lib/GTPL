import test from 'node:test';
import assert from 'node:assert/strict';
import { compareManifests } from './manifest-equivalence.mjs';

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
