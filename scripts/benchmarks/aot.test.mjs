import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><body></body>');
for (const key of ['window', 'document', 'DOMParser', 'Node', 'Element', 'HTMLElement'])
    globalThis[key] = key === 'window' ? dom.window : dom.window[key];
globalThis.addEventListener = dom.window.addEventListener.bind(dom.window);
globalThis.removeEventListener = dom.window.removeEventListener.bind(dom.window);
const output = await build({ entryPoints: ['src/lib/gtpl.ts'], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
const { default: lib } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
const { GCompile, GCompileSafe } = lib.jit;
const compiler = process.env.AOT_REFERENCE ? await import('../../artifacts/aot/reference/compiler.mjs') : lib.jit;
const { GTpl, GGenerator: g } = lib;
for (const backend of process.env.AOT_REFERENCE ? ['legacy'] : ['legacy', 'imperative', 'imperative-aliases']) {
    const test = (name, fn) => nodeTest(`${backend}: ${name}`, fn);
    const GCode = backend === 'legacy' ? compiler.GCode : html => compiler.GCodeOptimized(html, { methodAliases: backend === 'imperative-aliases' });
    const GCodeSafe = backend === 'legacy' ? compiler.GCodeSafe : html => compiler.GCodeOptimizedSafe(html, { methodAliases: backend === 'imperative-aliases' });
    const settle = async () => {
        for (let i = 0; i < 120; i++)
            await Promise.resolve();
    };
    const evaluate = code => new Function('g', `return ${code}`)(g);
    const mount = async (generator, root) => { const host = document.createElement('div'); document.body.append(host); const app = new GTpl({ generator, root }); app.addTo(host); await app.ready(); return { app, host }; };
    const dispose = ({ app, host }) => { app.destroy(); assert.equal(host.childNodes.length, 0); host.remove(); };
    test('same AOT generator isolates nodes, bindings, formulas, events and inherited list contexts', async () => {
        let creations = 0, cleanups = 0;
        lib.GregisterDirective('aot-probe-' + backend, class {
            constructor(ele, value, ctx) { creations++; ctx.onCleanup(() => cleanups++); }
        });
        const code = GCode(`<main g-switch="active"><section g-case="0"><article g-if="show"><template g-for="rows;index;row"><div aot-probe-${backend}="yes"><span aot-probe-${backend}="yes">static</span><input [value]="{{row.label}}"><button onclick="{{click()}}">{{row.label}}:{{return tick + 1}}</button></div></template></article></section><section g-case="1"><i aot-probe-${backend}="yes">{{title}}</i></section></main>`);
        const generator = GCompileSafe(evaluate(code));
        let clicked = 0;
        const roots = [0, 1].map(i => ({ active: 0, show: true, rows: [{ label: 'row' + i }], tick: i, title: 'title' + i, click() { clicked++; } }));
        const a = await mount(generator, roots[0]);
        const b = await mount(generator, roots[1]);
        assert.equal(creations, 4, 'inactive case has no directive instances');
        assert.match(a.host.textContent, /row0:1/);
        assert.match(b.host.textContent, /row1:2/);
        assert.notEqual(a.host.querySelector('button'), b.host.querySelector('button'));
        a.host.querySelector('button').dispatchEvent(new dom.window.Event('click'));
        assert.equal(clicked, 1);
        const input = a.host.querySelector('input');
        assert.equal(input.value, 'row0');
        input.value = 'edited';
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        await settle();
        assert.equal(roots[0].rows[0].label, 'edited');
        assert.equal(roots[1].rows[0].label, 'row1');
        let changes = 0;
        a.app.watch('tick', () => changes++);
        roots[0].tick = 7;
        await settle();
        assert.equal(changes, 1);
        assert.match(a.host.textContent, /edited:8/);
        const countBinds = tree => Object.values(tree || {}).reduce((n, entry) => n + (entry.me?.size || 0) + countBinds(entry.tree), 0);
        const ancestorBinds = countBinds(a.app.BindTree);
        for (let i = 0; i < 4; i++) {
            roots[0].active = 1;
            await settle();
            assert.equal(a.host.querySelector('button'), null);
            assert.match(a.host.textContent, /title0/);
            assert.match(b.host.textContent, /row1:2/);
            roots[0].active = 0;
            await settle();
            assert.equal(countBinds(a.app.BindTree), ancestorBinds, 'live ancestor bindings are released across remounts');
        }
        roots[0].show = false;
        await settle();
        assert.equal(a.host.querySelector('input'), null);
        roots[0].rows[0].label = 'hidden';
        await settle();
        assert.equal(a.host.querySelector('input'), null);
        roots[0].show = true;
        await settle();
        assert.equal(a.host.querySelector('input').value, 'hidden');
        a.app.refresh();
        await settle();
        dispose(a);
        dispose(b);
        assert.equal(cleanups, creations);
    });
    test('inactive template branches create neither text nodes nor bindings; branch definitions receive row contexts', async () => {
        const generator = evaluate(GCode('<main><template g-if="show">static<b>{{title}}</b></template><template g-for="rows;index;row"><template g-if="row.show"><b>{{row.label}}</b></template></template></main>'));
        const root = { show: false, title: 'title', rows: [{ show: false, label: 'row' }] };
        let texts = 0;
        const create = document.createTextNode.bind(document);
        document.createTextNode = (...args) => { texts++; return create(...args); };
        let view;
        try {
            view = await mount(generator, root);
            assert.equal(texts, 0);
            assert.equal(view.host.querySelectorAll('b').length, 0);
            root.show = true;
            root.rows[0].show = true;
            await settle();
            assert.equal(view.host.textContent, 'statictitlerow');
        }
        finally {
            document.createTextNode = create;
            if (view)
                dispose(view);
        }
    });
    test('JIT, safe AOT without dynamic evaluation, and legacy precompiled g contract', async () => {
        for (const compile of [html => GCompile(GCode(html)), html => evaluate(GCodeSafe(html))]) {
            const view = await mount(compile('<main><b>{{title}}</b></main>'), { show: true, title: 'works' });
            assert.equal(view.host.textContent, 'works');
            dispose(view);
        }
        const generator = evaluate(GCodeSafe('<b>{{title}}</b>'));
        const previous = globalThis.Function;
        globalThis.Function = () => { throw Error('dynamic evaluation forbidden'); };
        try {
            const view = await mount(GCompileSafe(generator), { title: 'CSP' });
            assert.equal(view.host.textContent, 'CSP');
            dispose(view);
        }
        finally {
            globalThis.Function = previous;
        }
        for (const html of ['<b>{{return title + 1}}</b>', '<b onclick="{{click()}}"></b>', '<b g-inner="title"></b>'])
            assert.throws(() => GCodeSafe(html), /Unsafe/);
        assert.throws(() => GCompileSafe('code'), /precompiled/);
        // Shape emitted by the previous compiler, including nested child functions.
        const old = (o) => [((o) => g('MAIN', [], [((o) => g('B', [], [g('#text', [{ type: 0, prop: 'textContent', link: { vorc: { va: ['title'] } } }], null, o)], o))], o))(o)];
        const view = await mount(old, { title: 'legacy' });
        assert.equal(view.host.textContent, 'legacy');
        dispose(view);
    });
    test('g-tpl, g-is, combined for/if, notif and nested switches preserve contextual generators', async () => {
        const tpl = document.createElement('template');
        tpl.id = 'aot-shared';
        tpl.innerHTML = '<b>{{row.label}}</b>';
        document.body.append(tpl);
        const gen = evaluate(GCode(`<main><template g-for="rows;index;row" g-if="row.show" g-tpl="aot-shared"></template><div g-is="view"></div><b g-notif="hide">visible</b><div g-switch="active"><template g-case="0"><i g-switch="inner"><b g-case="1">nested</b></i></template></div></main>`));
        const root = { rows: [{ show: true, label: 'yes' }, { show: false, label: 'no' }], view: evaluate(GCode('<u>{{title}}</u>')), title: 'view', hide: false, active: 0, inner: 1 };
        const view = await mount(gen, root);
        assert.match(view.host.textContent, /yesviewvisiblenested/);
        assert.doesNotMatch(view.host.textContent, /no/);
        root.rows[1].show = true;
        await settle();
        assert.match(view.host.textContent, /yesno/);
        dispose(view);
        tpl.remove();
    });
    // Observe mutable binding records through the public custom-g seam, independently
    // of the DOM and reactive scheduler.
    if (backend === 'legacy') test('structural binding records remain per invocation with custom g', () => {
        const calls = [];
        const generator = GCompile(GCode('<main g-switch="active"><section g-case="0"><b>{{title}}</b></section><section g-case="1"><i>{{title}}</i></section></main>'), (tag, attrs, children, context) => { calls.push(tag); return { tag, attrs, children, context }; });
        const left = generator({})[0].attrs.find(attr => attr.case);
        const right = generator({})[0].attrs.find(attr => attr.case);
        assert.equal(calls.length, 2, 'mount creates only the structural marker');
        assert.notEqual(left, right);
        assert.notEqual(left.link, right.link);
        assert.notEqual(left.case, right.case);
        const a = left.case[0].gen({});
        const b = right.case[0].gen({});
        assert.notEqual(a, b);
        const childA = typeof a.children[0] === 'function' ? a.children[0]({}) : a.children[0];
        const childB = typeof b.children[0] === 'function' ? b.children[0]({}) : b.children[0];
        assert.notEqual(childA.children[0].attrs[0], childB.children[0].attrs[0]);
    });
    test('a conditional template flattens nested g-tpl fragments into nodes only when activated', async () => {
        const tpl = document.createElement('template');
        tpl.id = 'aot-fragment';
        tpl.innerHTML = '<b>{{title}}</b><i>static</i>';
        document.body.append(tpl);
        const root = { show: false, title: 'fragment' };
        const view = await mount(evaluate(GCode('<main><template g-if="show"><template g-tpl="aot-fragment"></template></template></main>')), root);
        try {
            assert.equal(view.host.querySelector('b'), null);
            root.show = true;
            await settle();
            assert.equal(view.host.textContent, 'fragmentstatic');
            const include = document.createElement('template');
            include.setAttribute('g-tpl', 'aot-fragment');
            const direct = await mount(evaluate(GCode(include)), { title: 'top' });
            assert.equal(direct.host.textContent, 'topstatic');
            dispose(direct);
        }
        finally {
            dispose(view);
            tpl.remove();
        }
    });

    test('directives registered after compilation observe completed children before parent attributes', async () => {
        const name = 'aot-order-' + backend;
        const code = GCode(`<main ${name}="{{title}}"><b ${name}="static">{{title}}</b><i>tail</i></main>`);
        const seen = [];
        lib.GregisterDirective(name, class {
            constructor(ele, value) {
                seen.push([ele.tagName, ele.childNodes.length, value]);
                this.getAttribute = ele.getAttribute.bind(ele);
                this.setAttribute = ele.setAttribute.bind(ele);
            }
        });
        const view = await mount(evaluate(code), { title: 'bound' });
        assert.deepEqual(seen, [['B', 1, 'static'], ['MAIN', 2, '']]);
        assert.equal(view.host.textContent, 'boundtail');
        dispose(view);
    });

    test('mixed eager leaves and deferred siblings retain binding and directive registration order', () => {
        const name = 'aot-sibling-order-' + backend;
        const seen = [];
        lib.GregisterDirective(name, class {
            constructor(ele) { seen.push('directive:' + ele.tagName); }
        });
        const generator = evaluate(GCode(`<main ${name}="parent"><span ${name}="dynamic">{{a}}</span>literal<b ${name}="static">fixed</b><i ${name}="dynamic">{{b}}</i>{{c}}</main>`));
        generator({ addBind: bind => seen.push('bind:' + bind.link.vorc.va[0]) });
        assert.deepEqual(seen, ['directive:B', 'bind:c', 'bind:a', 'directive:SPAN', 'bind:b', 'directive:I', 'directive:MAIN']);
    });

    test('multiple roots, static attributes, styles and async formulas stay reactive', async () => {
        const root = { title: 'one', color: 'red' };
        const view = await mount(evaluate(GCode('head<!--note--><div title="{{title}}" style="color:{{color}};font-weight:bold">{{return await Promise.resolve(title)}}<span class="fixed">tail</span></div>foot')), root);
        assert.equal(view.host.textContent, 'headonetailfoot');
        assert.equal(view.host.querySelector('div').style.color, 'red');
        root.title = 'two';
        root.color = 'blue';
        await settle();
        assert.equal(view.host.querySelector('div').title, 'two');
        assert.equal(view.host.querySelector('div').style.color, 'blue');
        assert.equal(view.host.textContent, 'headtwotailfoot');
        dispose(view);
    });

}

if (!process.env.AOT_REFERENCE) nodeTest('imperative ordinary subtrees emit one render function and no generic node calls', async () => {
    const code = compiler.GCodeOptimized('<div><section title="{{title}}"><span>{{title}}</span><i>static</i></section></div>');
    assert.equal((code.match(/\(o\)=>/g) || []).length, 1);
    assert.doesNotMatch(code, /\bg\(/);
    assert.match(code, /createElement/);
    assert.match(code, /appendChild/);
    assert.match(code, /addBind/);
    const generator = evaluateOutside(code);
    const bindsA = [], bindsB = [];
    const a = generator({ addBind: bind => bindsA.push(bind) });
    const b = generator({ addBind: bind => bindsB.push(bind) });
    assert.equal(a.length, 1);
    assert.equal(bindsA.length, 2);
    assert.notEqual(a[0], b[0]);
    for (let i = 0; i < bindsA.length; i++) {
        assert.notEqual(bindsA[i], bindsB[i]);
        assert.notEqual(bindsA[i].link, bindsB[i].link);
        assert.notEqual(bindsA[i].ele, bindsB[i].ele);
    }
});
const evaluateOutside = code => new Function('g', `return ${code}`)(g);
nodeTest('append mounting resolves deeply nested legacy arrays/functions iteratively and in order', () => {
    const first = document.createTextNode('first'), last = document.createTextNode('last');
    let nested = first;
    for (let i = 0; i < 25000; i++) {
        const child = nested;
        nested = i % 2 ? [child] : () => child;
    }
    const nodes = [];
    lib.GAddTo(nodes, [null, nested, () => [undefined, last]], {});
    assert.deepEqual(nodes, [first, last]);
    const host = document.createElement('div');
    lib.GAddTo(host, [first, () => [null, last]], {});
    assert.equal(host.textContent, 'firstlast');
});

if (!process.env.AOT_REFERENCE) nodeTest('imperative variable identifiers remain valid in large ordinary subtrees', () => {
    const code = compiler.GCodeOptimized('<main>' + '<b>{{title}}</b>'.repeat(700) + '</main>');
    let bindings = 0;
    const roots = evaluateOutside(code)({ addBind() { bindings++; } });
    assert.equal(roots[0].childNodes.length, 700);
    assert.equal(bindings, 700);
});

if (!process.env.AOT_REFERENCE) nodeTest('imperative method aliases preserve document, binding and attribute receivers', () => {
    const documentReceiver = {
        createElement(tag) { assert.equal(this, documentReceiver); return document.createElement(tag); },
        createTextNode(value) { assert.equal(this, documentReceiver); return document.createTextNode(value); }
    };
    const bindings = [];
    const context = { addBind(bind) { assert.equal(this, context); bindings.push(bind); } };
    const custom = Object.assign(() => { throw Error('ordinary DOM should be direct'); }, {
        getDocument() { assert.equal(this, custom); return documentReceiver; },
        addAttributes(attrs, element, owner) {
            assert.equal(this, custom);
            assert.equal(owner, context);
            return g.addAttributes(attrs, element, owner);
        }
    });
    const code = compiler.GCodeOptimized('<main title="{{title}}"><b>{{title}}</b></main>', { methodAliases: true });
    const generator = new Function('g', `return ${code}`)(custom);
    const roots = generator(context);
    assert.equal(roots[0].querySelector('b').childNodes.length, 1);
    assert.equal(bindings.length, 2);
    assert.equal(bindings[0].ele.nodeType, 3);
    assert.equal(bindings[1].ele, roots[0]);
});
