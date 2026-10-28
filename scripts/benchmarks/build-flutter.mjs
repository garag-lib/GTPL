// Optional, independent toolchain. FLUTTER_BIN=/path/to/flutter node scripts/benchmarks/build-flutter.mjs
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, cp, readdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const project = path.join(root, 'scripts/benchmarks/flutter');
const dest = path.join(root, 'docs/benchmarks/vendor/flutter');
const flutter = process.env.FLUTTER_BIN || 'flutter';
const version = JSON.parse(execFileSync(flutter, ['--version', '--machine'], { encoding: 'utf8' }));
if (version.frameworkVersion !== '3.47.8') throw Error('This benchmark pins Flutter 3.47.8.');
// Avoid stale incremental Dart output when regenerating the published assets.
execFileSync(flutter, ['clean'], { cwd: project, stdio: 'inherit' });
execFileSync(flutter, ['pub', 'get'], { cwd: project, stdio: 'inherit' });
execFileSync(flutter, ['build', 'web', '--release', '--no-web-resources-cdn', '--no-wasm-dry-run'], { cwd: project, stdio: 'inherit' });
// Publish only the selected full CanvasKit renderer and application assets.
await rm(dest, { recursive: true, force: true });
await mkdir(path.join(dest, 'canvaskit'), { recursive: true });
for (const file of ['flutter_bootstrap.js', 'main.dart.js', 'assets'])
  await cp(path.join(project, 'build/web', file), path.join(dest, file), { recursive: true });
for (const file of ['canvaskit.js', 'canvaskit.wasm'])
  await cp(path.join(project, 'build/web/canvaskit', file), path.join(dest, 'canvaskit', file));
await cp(path.join(project, 'fonts/OFL.txt'), path.join(dest, 'RobotoMono-OFL.txt'));
const executable = flutter.includes('/') ? flutter : execFileSync('which', [flutter], { encoding: 'utf8' }).trim();
const sdkRoot = path.resolve(path.dirname(executable), '..');
await cp(path.join(sdkRoot, 'LICENSE'), path.join(dest, 'FLUTTER-LICENSE.txt'));

async function files(dir) {
  const result = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const filename = path.join(dir, item.name);
    if (item.isDirectory()) result.push(...await files(filename));
    else result.push(filename);
  }
  return result;
}
const published = [path.join(root, 'docs/benchmarks/vendor/grid-flutter.js'), ...await files(dest)].sort();
const assets = [];
for (const filename of published) {
  const data = await readFile(filename);
  assets.push({ file: path.relative(path.join(root, 'docs'), filename).split(path.sep).join('/'),
    bytes: data.length, gzipBytes: gzipSync(data).length,
    sha256: createHash('sha256').update(data).digest('hex') });
}
const entry = {
  version: version.frameworkVersion, dartVersion: version.dartSdkVersion,
  frameworkRevision: version.frameworkRevision, engineRevision: version.engineRevision,
  renderer: 'CanvasKit', compileTarget: 'dart2js', buildMode: 'release',
  file: 'benchmarks/vendor/grid-flutter.js',
  sha256: assets.find(asset => asset.file.endsWith('/grid-flutter.js')).sha256,
  bytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
  gzipBytes: assets.reduce((sum, asset) => sum + asset.gzipBytes, 0),
  assets,
};
await writeFile(path.join(dest, 'manifest.json'), JSON.stringify(entry, null, 2) + '\n');
const manifestFile = path.join(root, 'docs/benchmarks/manifest.json');
const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
manifest.gridFrameworks.flutter = entry;
await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Flutter ${entry.version}: ${(entry.gzipBytes / 1024).toFixed(1)} KiB gzip, including CanvasKit and fonts`);
