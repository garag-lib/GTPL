import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';

const docs = new URL('../../docs/', import.meta.url);
test('published Flutter grid contains the complete pinned local release with matching hashes', async () => {
  const manifest = JSON.parse(await readFile(new URL('benchmarks/manifest.json', docs)));
  const entry = manifest.gridFrameworks.flutter;
  assert.equal(entry.version, '3.47.8');
  assert.equal(entry.buildMode, 'release');
  assert.equal(entry.renderer, 'CanvasKit');
  assert.equal(entry.compileTarget, 'dart2js');
  assert.equal(manifest.methods.styles.flutter, undefined);
  for (const suffix of ['main.dart.js', 'canvaskit.wasm', 'RobotoMono.ttf'])
    assert.ok(entry.assets.some(asset => asset.file.endsWith(suffix)), suffix);
  let total = 0;
  for (const asset of entry.assets) {
    const bytes = await readFile(new URL(asset.file, docs));
    assert.equal(bytes.length, asset.bytes, asset.file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, asset.file);
    total += bytes.length;
  }
  assert.equal(total, entry.bytes);
});
test('Flutter is present on both sides and initially restricted to Grid in both entry pages', async () => {
  for (const file of ['benchmarks.html', 'benchmarks/lab.html']) {
    const dom = new JSDOM(await readFile(new URL(file, docs), 'utf8'));
    try {
      for (const side of ['a', 'b']) {
        const option = dom.window.document.querySelector(`#engine-${side} option[value="flutter"]`);
        assert.ok(option);
        assert.ok(option.hidden && option.disabled);
      }
    } finally { dom.window.close(); }
  }
});
