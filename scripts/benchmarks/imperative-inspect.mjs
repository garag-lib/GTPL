// Instrument generated functions separately from timing samples.
// node scripts/benchmarks/imperative-inspect.mjs imperative-legacy imperative
import { build } from 'esbuild';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
import { readFile, writeFile } from 'node:fs/promises';

const dom = new JSDOM('<!doctype html><body></body>');
for (const key of ['window', 'document', 'DOMParser', 'Node', 'Element', 'HTMLElement'])
    globalThis[key] = key === 'window' ? dom.window : dom.window[key];
globalThis.addEventListener = dom.window.addEventListener.bind(dom.window);
globalThis.removeEventListener = dom.window.removeEventListener.bind(dom.window);
const output = await build({ entryPoints: ['src/lib/gtpl.ts'], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
const { default: lib } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
const results = [];
for (const label of process.argv.slice(2)) {
    const sizes = JSON.parse(await readFile(`artifacts/aot/${label}/sizes.json`, 'utf8'));
    for (const file of Object.keys(sizes).filter(name => /^(plain|switch\d+|if|list|nested)\.js$/.test(name))) {
        const name = file.slice(0, -3);
        const code = await readFile(`artifacts/aot/${label}/${file}`, 'utf8');
        let definitions = 0;
        const source = ts.createSourceFile('generator.js', `const generator=${code};`, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
        const transformed = ts.transform(source, [context => {
            const visit = node => {
                node = ts.visitEachChild(node, visit, context);
                if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) return node;
                definitions++;
                const f = context.factory;
                const increment = f.createExpressionStatement(f.createPostfixIncrement(f.createPropertyAccessExpression(f.createIdentifier('counter'), 'calls')));
                const statements = ts.isBlock(node.body) ? node.body.statements : [f.createReturnStatement(node.body)];
                const body = f.createBlock([increment, ...statements], true);
                return ts.isArrowFunction(node)
                    ? f.updateArrowFunction(node, node.modifiers, node.typeParameters, node.parameters, node.type, node.equalsGreaterThanToken, body)
                    : f.updateFunctionExpression(node, node.modifiers, node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type, body);
            };
            return root => ts.visitNode(root, visit);
        }]);
        const instrumented = ts.createPrinter().printFile(transformed.transformed[0]);
        transformed.dispose();
        const counter = { calls: 0 };
        let genericCalls = 0;
        const g = Object.assign((...args) => { genericCalls++; return lib.GGenerator(...args); }, lib.GGenerator);
        const generator = new Function('g', 'counter', `${instrumented};return generator;`)(g, counter);
        const root = { active: name === 'if' ? false : 0, show: true, tick: 0, title: 'hello', rows: [{ label: 'a' }, { label: 'b' }] };
        const host = document.createElement('div');
        document.body.append(host);
        const app = new lib.GTpl({ generator, root });
        app.addTo(host);
        await app.ready();
        const result = { label, name, definitions, invokedAtMount: counter.calls, genericCallsAtMount: genericCalls, elements: host.querySelectorAll('*').length, ...sizes[file] };
        app.destroy();
        if (host.childNodes.length) throw Error('destroy left DOM');
        host.remove();
        results.push(result);
        console.log(result);
    }
}
await writeFile('artifacts/aot/imperative-inspection.json', JSON.stringify(results, null, 2));
