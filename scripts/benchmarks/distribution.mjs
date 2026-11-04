import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

// Distribution entries may be facades. Account for every transitive local
// import, including shared chunks; external dependencies remain external.
export async function distributionFiles(entry) {
    const files = new Map();
    async function visit(file) {
        file = path.resolve(file);
        if (files.has(file)) return;
        const source = await readFile(file);
        files.set(file, source);
        const imports = /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)["'](\.[^"']+)["']/g;
        for (const match of source.toString().matchAll(imports))
            await visit(path.resolve(path.dirname(file), match[1]));
    }
    await visit(entry);
    return files;
}

export async function distributionSize(entry) {
    const files = await distributionFiles(entry);
    const base = path.dirname(path.resolve(entry));
    return {
        bytes: [...files.values()].reduce((sum, source) => sum + source.length, 0),
        gzip: [...files.values()].reduce((sum, source) => sum + gzipSync(source, { level: 9 }).length, 0),
        files: [...files].map(([file, source]) => ({
            file: path.relative(base, file), bytes: source.length,
            gzip: gzipSync(source, { level: 9 }).length,
            sha256: createHash('sha256').update(source).digest('hex')
        }))
    };
}
