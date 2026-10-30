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
    test('g-is retains its row anchor when an external component is destroyed and replaced in the same batch', async () => {
        const componentGenerator = evaluate(GCode('<strong>{{label}}</strong>'));
        const components = [];
        const component = label => {
            const child = new GTpl({ root: { label }, generator: componentGenerator });
            components.push(child);
            return child;
        };
        let current = component('initial');
        const sibling = component('sibling');
        const root = { rows: [{ node: current.Elements[0] }, { node: sibling.Elements[0] }] };
        const view = await mount(evaluate(GCode('<div g-for="rows;index;row"><b>before</b><span g-is="row.node"></span><i>after</i></div>')), root);
        try {
            const row = view.host.firstElementChild;
            const anchor = [...row.childNodes].find(node => node.nodeType === 8);
            assert.ok(anchor, 'g-is keeps an anchor beside the component');
            for (let step = 0; step < 4; step++) {
                const oldNode = current.Elements[0];
                current.destroy();
                assert.equal(oldNode.parentNode, null);
                assert.equal(anchor.parentNode, row, 'component destruction preserves the insertion point');
                current = component(`replacement ${step}`);
                if (step % 2) root.rows[0] = { node: current.Elements[0] };
                else root.rows[0].node = current.Elements[0];
                await settle();
                assert.deepEqual([...row.children].map(node => node.tagName), ['B', 'STRONG', 'I']);
                assert.equal(row.textContent, `beforereplacement ${step}after`);
                assert.equal(view.host.children[1].textContent, 'beforesiblingafter');
                assert.equal(anchor.parentNode, row);
            }
            root.rows = [];
            await settle();
            assert.equal(view.host.contains(anchor), false, 'removing the row removes its anchor from the host');
        } finally {
            dispose(view);
            for (const child of components) if (!child.isDestroyed) child.destroy();
        }
    });
    for (const mounted of [false, true]) test(`g-is keeps generated fragments and a shared g-if anchor ${mounted ? 'after' : 'before'} mounting`, async () => {
        const root = { view: evaluate(GCode('<u>initial</u>')), show: true, rows: ['one', 'two'] };
        const app = new GTpl({ root, generator: evaluate(GCode('<b>before</b><template g-if="show" g-is="view"></template><i>after</i>')) });
        const host = document.createElement('div');
        document.body.append(host);
        const view = { app, host };
        if (mounted) app.addTo(host);
        try {
            await app.ready();
            root.view = evaluate(GCode('<u>first</u><u>second</u>'));
            await settle();
            if (!mounted) app.addTo(host);
            assert.equal(host.textContent, 'beforefirstsecondafter');
            const anchor = [...host.childNodes].find(node => node.nodeType === 8 && app.Elements.includes(node));
            assert.ok(anchor);
            root.show = false;
            await settle();
            assert.equal(host.textContent, 'beforeafter');
            root.view = evaluate(GCode('<u g-for="rows;index;row">{{row}}</u>'));
            await settle();
            assert.equal(host.textContent, 'beforeafter');
            root.show = true;
            await settle();
            assert.equal(host.textContent, 'beforeonetwoafter');
            root.view = null;
            await settle();
            root.show = false;
            await settle();
            root.show = true;
            await settle();
            assert.equal(host.textContent, 'beforeafter', 'toggling g-if cannot restore a destroyed component');
            root.view = () => [];
            await settle();
            assert.equal(host.textContent, 'beforeafter');
            root.view = evaluate(GCode('<u>restored</u>'));
            await settle();
            assert.equal(host.textContent, 'beforerestoredafter');
            assert.equal(anchor.parentNode, host);
        } finally {
            dispose(view);
        }
    });
    for (const kind of ['g-is', 'g-switch', 'g-for']) test(`${kind} stops replacement when a child's cleanup destroys its parent`, async () => {
        const name = `dispose-parent-${backend}-${kind}`;
        let view, cleanups = 0;
        lib.GregisterDirective(name, class {
            constructor(ele, value, ctx) {
                ctx.onCleanup(() => { cleanups++; view.app.destroy(); });
            }
        });
        const root = { view: evaluate(GCode(`<strong ${name}="">old</strong>`)), selected: 0, rows: ['old'] };
        const html = kind === 'g-is' ? '<span g-is="view"></span>' : kind === 'g-switch'
            ? `<template g-switch="selected"><strong g-case="0" ${name}="">old</strong><b g-case="1">replacement</b></template>`
            : `<strong g-for="rows;i;row" ${name}="">{{row}}</strong>`;
        view = await mount(evaluate(GCode(html)), root);
        const messages = [], error = console.error, warn = console.warn;
        console.error = console.warn = (...args) => messages.push(args);
        try {
            if (kind === 'g-is') root.view = evaluate(GCode('<b>replacement</b>'));
            else if (kind === 'g-switch') root.selected = 1;
            else root.rows = [];
            await settle();
            assert.equal(view.app.isDestroyed, true);
            assert.equal(cleanups, 1, 'a child is disposed once, including reentrant parent disposal');
            assert.equal(view.host.childNodes.length, 0);
            assert.deepEqual(messages, []);
        } finally {
            console.error = error;
            console.warn = warn;
            if (!view.app.isDestroyed) view.app.destroy();
            view.host.remove();
        }
    });
    test('g-is replaces a DOM fragment without retaining its old inserted siblings', async () => {
        const fragment = (label, count = 2) => {
            const result = document.createDocumentFragment();
            for (const suffix of ['one', 'two'].slice(0, count)) {
                const node = document.createElement('u');
                node.textContent = `${label} ${suffix}`;
                result.append(node);
            }
            return result;
        };
        const root = { content: fragment('old') };
        const view = await mount(evaluate(GCode('<b>before</b><span g-is="content"></span><i>after</i>')), root);
        try {
            assert.equal(view.host.textContent, 'beforeold oneold twoafter');
            for (const [label, count] of [['new', 2], ['single', 1], ['empty', 0]]) {
                root.content = fragment(label, count);
                await settle();
                const expected = ['one', 'two'].slice(0, count).map(suffix => `${label} ${suffix}`).join('');
                assert.equal(view.host.textContent, `before${expected}after`);
            }
            root.content = document.createTextNode('text');
            await settle();
            assert.equal(view.host.textContent, 'beforetextafter');
            root.content = fragment('restored');
            await settle();
            assert.equal(view.host.textContent, 'beforerestored onerestored twoafter');
            root.content = null;
            await settle();
            assert.equal(view.host.textContent, 'beforeafter');
        } finally { dispose(view); }
    });
    test('g-is does not create an orphan if removing its DOM node destroys the parent', async () => {
        const name = `dispose-disconnected-${backend}`;
        let view;
        dom.window.customElements.define(name, class extends dom.window.HTMLElement {
            disconnectedCallback() { view.app.destroy(); }
        });
        const node = document.createElement(name);
        node.textContent = 'old';
        const root = { content: node };
        view = await mount(evaluate(GCode('<span g-is="content"></span>')), root);
        try {
            root.content = evaluate(GCode('<b>replacement</b>'));
            await settle();
            assert.equal(view.app.isDestroyed, true);
            assert.equal(view.app.GtplChilds.size, 0, 'a destroyed owner cannot acquire a replacement child');
            assert.equal(view.host.childNodes.length, 0);
        } finally {
            if (!view.app.isDestroyed) view.app.destroy();
            view.host.remove();
        }
    });
    test('nested structural bindings preserve anchors through mixed same-batch replacements and removals', async () => {
        const render = evaluate(GCode('<u>{{row.label}}</u>'));
        const alternate = evaluate(GCode('<strong>{{row.label}}</strong>'));
        const row = (label, type = 'component', content = render) => ({ label, type, content });
        const root = { visible: true, rows: [row('one'), row('two', 'text')] };
        const view = await mount(evaluate(GCode('<b>before</b><template g-if="visible"><template g-for="rows;i;row"><template g-switch="row.type"><template g-case="\'component\'"><span g-is="row.content"></span></template><em g-case="\'text\'">{{row.label}}</em></template></template></template><i>after</i>')), root);
        const messages = [], error = console.error;
        console.error = (...args) => messages.push(args);
        const check = async () => {
            await settle();
            const expected = root.visible ? root.rows.map(value =>
                value.type === 'text' || (value.type === 'component' && value.content) ? value.label : '').join('') : '';
            assert.equal(view.host.textContent, `before${expected}after`);
            assert.equal(view.host.firstElementChild.tagName, 'B');
            assert.equal(view.host.lastElementChild.tagName, 'I');
            assert.deepEqual(messages, []);
        };
        try {
            for (let step = 0; step < 6; step++) {
                root.rows[0].content = alternate;
                root.rows[0].label = `old ${step}`;
                root.rows = [row(`new ${step}`), row(`text ${step}`, 'text')];
                await check();
                root.visible = false;
                root.rows[0].type = 'text';
                root.rows.push(row(`tail ${step}`));
                await check();
                root.rows[0].type = 'component';
                root.rows[0].content = alternate;
                root.rows[1].type = null;
                root.visible = true;
                await check();
                root.rows.reverse();
                root.rows[0].content = null;
                await check();
                root.visible = false;
                root.rows = [];
                view.app.refresh();
                await check();
                root.rows.push(row(`restored ${step}`), row(`last ${step}`, 'text'));
                root.visible = true;
                await check();
            }
        } finally {
            console.error = error;
            dispose(view);
        }
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

    test('repeated g-tpl fragments share their enclosing scope without sharing nodes or bindings', async () => {
        const shared = document.createElement('template');
        shared.id = 'aot-repeated-fragment';
        shared.innerHTML = '<b>{{title}}</b><i>static</i>tail<!--marker-->';
        const nested = document.createElement('template');
        nested.id = 'aot-nested-fragment';
        nested.innerHTML = '<template g-tpl="aot-repeated-fragment"></template><u>{{title}}</u>';
        document.body.append(shared, nested);
        const pair = '<template g-tpl="aot-repeated-fragment"></template><span>{{other}}</span><template g-tpl="aot-repeated-fragment"></template>';
        const root = { title: 'one', other: 'middle', show: true, rows: [1, 2] };
        let view;
        try {
            const generator = GCompileSafe(evaluate(GCode(`<main>${pair}<template g-tpl="aot-nested-fragment"></template><template g-tpl="aot-nested-fragment"></template><article g-if="show">${pair}</article><div g-for="rows;i;row">${pair}</div></main>`)));
            view = await mount(generator, root);
            const check = title => {
                const bold = [...view.host.querySelectorAll('b')];
                assert.equal(bold.length, root.show ? 10 : 8);
                assert.equal(new Set(bold).size, bold.length, 'each include creates fresh elements');
                assert.ok(bold.every(node => node.textContent === title));
                assert.ok([...view.host.querySelectorAll('u')].every(node => node.textContent === title));
                assert.ok([...view.host.querySelectorAll('span')].every(node => node.textContent === root.other));
                assert.equal(view.host.querySelector('main').firstElementChild.tagName, 'B');
                assert.match(view.host.querySelector('main').textContent, new RegExp(`^${title}statictail${root.other}${title}statictail`));
            };
            check('one');
            root.title = 'two'; root.other = 'updated';
            await settle(); check('two');
            root.show = false;
            await settle(); check('two');
            root.show = true;
            await settle(); check('two');
        } finally {
            if (view) dispose(view);
            shared.remove(); nested.remove();
        }
    });

    test('template conditions hide live structural ranges and preserve updates while detached', async () => {
        const root = { show: true, inner: true, title: 'one', active: 0, rows: [{ label: 'first', status: 'a' }] };
        const view = await mount(evaluate(GCode('<main><u>before</u><template g-if="show"><strong>{{title}}</strong><template g-if="inner"><div g-for="rows;i;row"><span>{{row.label}}</span><template g-switch="row.status"><b g-case="\'a\'">A</b><b g-case="\'b\'">B</b></template></div></template><i>tail</i></template><template g-if="show" g-switch="active"><em g-case="0">zero</em><em g-case="1">one</em></template><template g-if="show"></template><u>after</u></main>')), root);
        const checkHidden = () => {
            assert.equal(view.host.textContent, 'beforeafter');
            assert.equal(view.host.querySelectorAll('div, strong, i, em').length, 0);
        };
        try {
            assert.equal(view.host.textContent, 'beforeonefirstAtailzeroafter');
            root.show = false;
            await settle(); checkHidden();
            root.title = 'updated'; root.rows[0].label = 'changed'; root.rows[0].status = 'b';
            root.rows.push({ label: 'new', status: 'a' }); root.active = 1;
            await settle(); checkHidden();
            root.show = true;
            await settle();
            assert.equal(view.host.textContent, 'beforeupdatedchangedBnewAtailoneafter');
            for (let i = 0; i < 3; i++) {
                root.show = false;
                await settle(); checkHidden();
                root.inner = false;
                await settle(); checkHidden();
                root.show = true;
                await settle();
                assert.equal(view.host.textContent, 'beforeupdatedtailoneafter');
                root.inner = true;
                await settle();
                assert.equal(view.host.textContent, 'beforeupdatedchangedBnewAtailoneafter');
            }
        } finally { dispose(view); }
    });

    test('root template ranges move all generated siblings and remove them on destruction', async () => {
        const root = { show: false, rows: [{ label: 'first', visible: true }, { label: 'second', visible: false }] };
        const template = document.createElement('template');
        template.setAttribute('g-if', 'show');
        template.innerHTML = '<template g-for="rows;i;row"><template g-if="row.visible"><b>{{row.label}}</b></template></template>';
        const view = await mount(evaluate(GCode(template)), root);
        try {
            assert.equal(view.host.querySelectorAll('b').length, 0);
            root.show = true;
            await settle();
            assert.equal(view.host.textContent, 'first');
            root.show = false;
            await settle();
            assert.equal(view.host.querySelectorAll('b').length, 0);
            root.rows = [{ label: 'replacement', visible: true }, { label: 'last', visible: true }];
            await settle();
            assert.equal(view.host.textContent, '');
            root.show = true;
            await settle();
            assert.equal(view.host.textContent, 'replacementlast');
            const fragment = document.createDocumentFragment();
            view.app.addTo(fragment);
            assert.equal(view.host.childNodes.length, 0, 'moving the view leaves no generated siblings behind');
            assert.equal(fragment.textContent, 'replacementlast');
            view.host.append(fragment);
            root.rows[0].visible = false;
            await settle();
            assert.equal(view.host.textContent, 'last');
        } finally { dispose(view); }
    });

    test('a single concrete template root retains nested list updates while hidden', async () => {
        const root = { show: true, rows: ['first'] };
        const view = await mount(evaluate(GCode('<main><template g-if="show"><div><b g-for="rows;i;row">{{row}}</b></div></template></main>')), root);
        const element = view.host.querySelector('div');
        try {
            assert.equal(element.textContent, 'first');
            root.show = false;
            await settle();
            assert.equal(view.host.querySelector('div'), null);
            root.rows = ['changed', 'new'];
            await settle();
            assert.equal(element.textContent, 'changednew');
            root.show = true;
            await settle();
            assert.equal(view.host.querySelector('div'), element);
            assert.equal(view.host.textContent, 'changednew');
        } finally { dispose(view); }
    });

    test('template source strings retain leading template roots, sibling order and safe restrictions', async () => {
        const rows = '<template g-for="rows;i;row"><b>{{row}}</b></template>';
        const scenarios = [
            { html: `<template g-if="show">${rows}</template>`, prefix: '', suffix: '' },
            { html: `<template g-if="show"><i>first</i></template><template g-if="show">${rows}</template><div>tail</div>`, prefix: 'first', suffix: 'tail' }
        ];
        for (const compile of [GCode, GCodeSafe]) {
            for (const scenario of scenarios) {
                const root = { show: true, rows: ['one', 'two'] };
                const view = await mount(GCompileSafe(evaluate(compile(scenario.html))), root);
                try {
                    assert.equal(view.host.textContent, `${scenario.prefix}onetwo${scenario.suffix}`);
                    root.show = false;
                    await settle();
                    assert.equal(view.host.textContent, scenario.suffix);
                    root.rows = ['replacement'];
                    root.show = true;
                    await settle();
                    assert.equal(view.host.textContent, `${scenario.prefix}replacement${scenario.suffix}`);
                } finally { dispose(view); }
            }
        }
        for (const html of [
            '<template g-if="show">{{return count + 1}}</template>',
            '<template g-if="show"><button onclick="{{click()}}">click</button></template>',
            '<template g-if="show"><b g-inner="content"></b></template>'
        ]) assert.throws(() => GCodeSafe(html), /Unsafe/);
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

    test('batched list mutations reconcile the final order and retain incremental updates for one row', async () => {
        let calculations = 0;
        const rawRows = [{ label: 'c' }, { label: 'b' }, { label: 'a' }];
        const root = { rows: rawRows, probe(value) { calculations++; return value; } };
        const view = await mount(evaluate(GCode('<main><div g-for="rows;i;row"><b>{{i}}</b><span>{{return probe(row.label)}}</span></div></main>')), root);
        const labels = () => [...view.host.querySelectorAll('span')].map(node => node.textContent);
        const check = () => {
            assert.deepEqual(labels(), root.rows.map(row => row.label));
            assert.deepEqual([...view.host.querySelectorAll('b')].map(node => node.textContent), root.rows.map((_, i) => String(i)));
        };
        try {
            const first = view.host.querySelector('div');
            root.rows[1].label = 'single';
            await settle(); check();
            assert.equal(view.host.querySelector('div'), first, 'one row update preserves other DOM');
            calculations = 0;
            for (let i = 0; i < 1000; i++) root.rows[1].label = 'burst' + i;
            await settle(); check();
            assert.equal(calculations, 1, 'a burst for one row does not recalculate other rows');
            rawRows[1].label = 'raw refresh';
            view.app.refresh();
            await settle(); check();
            rawRows[0].label = 'raw reassignment';
            root.rows[0] = rawRows[0];
            await settle(); check();
            root.rows.push({ label: 'pushed' }); root.rows.unshift({ label: 'first' }); root.rows.splice(2, 1, { label: 'replacement' });
            root.rows[1].label = 'changed';
            await settle(); check();
            root.rows.reverse(); root.rows.sort((a, b) => a.label.localeCompare(b.label)); root.rows.pop(); root.rows.shift();
            await settle(); check();
            root.rows.length = 1;
            await settle(); check();
            root.rows = [{ label: 'new' }, { label: 'last' }];
            root.rows[0].label = 'final'; root.rows.push({ label: 'tail' });
            await settle(); check();
            root.rows = [];
            await settle(); check();
        } finally { dispose(view); }
    });

    test('a returned async function is awaited without await in the template formula', async () => {
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        const root = { funcion_asincrona: async () => { await gate; return 'resultado async'; } };
        const host = document.createElement('div'); document.body.append(host);
        const app = new GTpl({ root, generator: evaluate(GCode('<p>{{ return funcion_asincrona() }}</p>')) });
        app.addTo(host);
        try {
            let completed = false;
            const ready = app.ready().then(() => { completed = true; });
            await settle();
            assert.equal(completed, false);
            assert.equal(host.querySelector('p').textContent, '');
            release(); await ready;
            assert.equal(host.textContent, 'resultado async');
            root.funcion_asincrona = async () => 'nuevo resultado';
            await settle();
            assert.equal(host.textContent, 'nuevo resultado');
        } finally { dispose({ app, host }); }
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
