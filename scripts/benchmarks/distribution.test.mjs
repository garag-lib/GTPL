import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { distributionSize } from './distribution.mjs';

test('distribution accounting follows shared chunks once, including cycles and CJS', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'gtpl-size-'));
    const sources = {
        'entry.js': `import './shared.js'; export { value } from './other.js';`,
        'shared.js': `import './other.js'; export const value = 1;`,
        'other.js': `import './shared.js'; export { value } from './shared.js';`,
        'entry.cjs': `module.exports = require('./shared.js');`
    };
    try {
        for (const [file, source] of Object.entries(sources)) await writeFile(path.join(directory, file), source);
        for (const entry of ['entry.js', 'entry.cjs']) {
            const result = await distributionSize(path.join(directory, entry));
            assert.equal(result.files.length, 3);
            assert.equal(result.bytes, Buffer.byteLength(sources[entry] + sources['shared.js'] + sources['other.js']));
            assert.ok(result.files.every(file => file.sha256.length === 64));
        }
    } finally { await rm(directory, { recursive: true, force: true }); }
});
