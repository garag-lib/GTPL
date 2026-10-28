# GTPL

Reactive template library with direct DOM updates and Proxy-based reactivity.

GTPL is a TypeScript library for reactive template systems built around Direct DOM and Proxy. Inspired by Vue, Angular AOT, and JSX, it delivers efficient reactive UI updates in a compact 11kB JavaScript package.

GTPL provides:
- A small runtime for reactive rendering.
- Template compilation in two modes: JIT (runtime) and AOT (precompiled).
- Built-in directives for conditional rendering, loops, switching, styles, and dynamic attributes.

Interactive examples: https://garag-lib.github.io/GTPL/

Interactive benchmarks: https://garag-lib.github.io/GTPL/benchmarks.html
Compare GTPL with React, Svelte, Vue, Alpine, Angular and direct DOM using real browser
measurements. See [benchmark methodology and build instructions](docs/benchmarks/README.md).

## Installation

```bash
npm install @mpeliz/gtpl
```

## Quick Start (JIT)

```ts
import gtpl from '@mpeliz/gtpl';

const { GTpl, jit: { GCode, GCompile } } = gtpl;

const template = `
  <div>
    <h2>Counter: {{ count }}</h2>
    <button onclick="{{ this.count = this.count + 1 }}">+1</button>
    <button onclick="{{ this.count = 0 }}">Reset</button>
  </div>
`;

const root = { count: 0 };
const aot = GCode(template);
const generator = GCompile(aot);

const app = new GTpl({ root, generator });
app.addTo(document.getElementById('app'));
```

## Replacing server-rendered content

Mount into a `DocumentFragment` and await the initial render before replacing
the container's children. Supply the original template and the same initial
data used by the server:

```js
const container = document.getElementById('app');
const root = JSON.parse(document.getElementById('initial-data').textContent);
const fragment = document.createDocumentFragment();
let app;

try {
  app = new GTpl({ root, generator });
  app.addTo(fragment);
  await app.ready();
  container.replaceChildren(fragment);
} catch (error) {
  app?.destroy();
  console.error(error);
}
```

The container stays in place, and the generated nodes retain their listeners
and bindings when moved. The mounting step must precede `ready()` so structural
directives can insert and remove nodes. The same sequence works with JIT and AOT
generators.

`ready()` returns a cached `Promise<void>` for the initial render, including
asynchronous bindings and work started by generated children (`g-for`, `g-if`,
`g-switch`, and `g-is`). It rejects on an initial binding/render error or if the
instance is destroyed before initialization finishes. It does not trigger a
refresh or wait for subsequent reactive updates. With `refresh: false`, start
the initial refresh explicitly before calling `ready()`.

## JIT vs AOT

| Mode | When to use | Flow |
|---|---|---|
| JIT | Dynamic templates generated at runtime | `template -> GCode -> GCompile -> GTpl` |
| AOT | Stable templates compiled during build | `precompiled code -> GCompile -> GTpl` |

AOT is recommended for production when templates are known in advance.

## Template Syntax

| Syntax | Meaning |
|---|---|
| `{{ foo }}` | Read variable |
| `{{ 'hello' }}` | Constant |
| `{{ foo:format }}` | Pipe/chained function |
| `{{ return foo + 1 }}` | Formula expression |
| `onclick="{{ this.count++ }}"` | Event expression |
| `[value]="{{ foo }}"` | Two-way bind property |

## Built-in Directives

| Directive | Purpose |
|---|---|
| `g-if` | Render when truthy |
| `g-notif` | Render when falsy |
| `g-switch` / `g-case` | Switch/case rendering |
| `g-for="arr;index;value"` | List rendering |
| `g-attr` | Dynamic attributes from object |
| `g-style` | Dynamic inline styles |
| `g-inner` | Set `innerHTML` |
| `g-tpl` | Reuse named templates |
| `g-bind` / `g-binds` | Element/collection references |

## API Overview

```ts
import gtpl from '@mpeliz/gtpl';

const { GTpl, GregisterDirective, jit: { GCode, GCompile } } = gtpl;
```

Main pieces:
- `GCode(html)`: parses template HTML into generated code string.
- `GCodeOptimized(html)`: opt-in imperative backend; creates ordinary DOM subtrees directly and keeps lazy generators at structural directives.
- `GCodeOptimizedSafe(html)`: imperative backend with the same parsing restrictions and options as `GCodeSafe`.
- `GCompile(code)`: compiles generated code into a render function.
- `GCodeSafe(html)`: safe parser mode (blocks formulas, inline events, and `g-inner`).
- `GCompileSafe(generatorFn)`: accepts only precompiled generator functions (no runtime eval).
- `new GTpl({ root, generator })`: creates reactive instance.
- `instance.addTo(node)`: mounts rendered nodes.
- `instance.watch(path, cb)`: subscribes to reactive path changes.
- `instance.refresh()`: triggers recomputation.
- `instance.ready()`: waits for initial rendering; mount before awaiting.
- `instance.destroy()`: removes listeners, bindings, and rendered nodes.
- `GregisterDirective(name, class)`: register custom directive.

## Imperative compiler (opt-in)

Use the imperative backend with the existing compile and mount APIs:

```ts
const { GTpl, jit: { GCodeOptimized, GCompile } } = gtpl;
const generator = GCompile(GCodeOptimized('<div><span>{{name}}</span></div>'));
const app = new GTpl({ root: { name: 'GTPL' }, generator });
app.addTo(document.body);
await app.ready();
```

`GCode` remains the default/reference backend. Both compilers use the same parser
and structural directive handling. The imperative backend emits one function for
ordinary descendants, creates fresh DOM and binding records for each invocation,
and retains deferred generators for `g-if`, `g-for`, `g-switch` and `g-is`.
To reduce emitted source size, enable `GCodeOptimized(template, { methodAliases: true })`.
Repeated method names then use local property-key aliases, for example
`const $a = "appendChild"; parent[$a](child)`. This preserves each method's
receiver and avoids adding wrapper functions. This option defaults to `false`:
it reduces large templates' bytes but slowed initial rendering in our Chrome
measurements. Attributes still use the runtime directive lookup, including
directives registered after compilation. Child bindings and directives precede parent attributes.

For AOT, assign the emitted expression to a generator with the current
`GGenerator` available as `g`, then pass it through `GCompileSafe`. This needs no
runtime evaluation. The imperative output requires the current runtime's
`g.getDocument()` and `g.addAttributes()` helpers; a custom `g` supplied to
`GCompile` must provide those helpers. Existing precompiled generators keep their
original `g(tag, attrs, children, context)` contract.

See [the comparison and reproduction instructions](docs/benchmarks/imperative-performance.md).

## Reactive update batching

State assignments and `watch()` callbacks are synchronous. DOM bindings are
queued by binding identity and run in a microtask, so repeated writes in the same
synchronous task calculate the final state once. Synchronous text, attributes,
styles and formulas do not allocate update promises after `ready()`; asynchronous
formulas remain supported and superseded results cannot overwrite newer output.
Synchronous ancestor updates reconcile before descendants, including nested lists invalidated
by replacing an outer row. Removed children cancel their queued bindings before
calculation; surviving children read the reconciled data in the same batch.
Asynchronous structural expressions keep existing children active until their
latest result resolves.

`ready()` still waits for the initial render and generated children. Call it after
mounting; it is not a general wait for later updates. A single nested list update
keeps the row's incremental path. Merged structural changes reconcile the final
list; explicit `refresh()` continues to refresh changes made outside proxies.

The scheduler and grid measurement protocol are documented in
[the runtime comparison](docs/benchmarks/scheduler-performance.md).

## Browser Global Build

If you use the global bundle (`dist/gtpl.global.js`):

```html
<script src="dist/gtpl.global.js"></script>
<script>
  const { GTpl, jit: { GCode, GCompile } } = gtpl;
</script>
```

## Releases (Precompiled Builds)

`main` tracks version 2.x. The `1.1.8` branch preserves the final pre-2.0
`main` commit; the existing `v1.1.8` release tag retains its original commit.

Version 2.0 batches DOM binding updates in a microtask. State assignments and
`watch()` callbacks remain synchronous; code that reads the DOM immediately after
a state change must wait for the queued update. See [reactive update batching](#reactive-update-batching)
for nested bindings and `ready()` semantics. `GCodeOptimized` remains an opt-in
compiler backend; `GCode` remains the default reference backend.

When a GitHub Release is published, GitHub Actions runs tests, builds `dist/`, and uploads precompiled assets
(`.zip` and `.tar.gz`) to that release automatically:

https://github.com/garag-lib/GTPL/releases

To publish a new release:

```bash
# single command flow (tests + build + version bump + commit + push + tag push)
npm run release -- 2.0.1

# then publish release in GitHub UI for that tag (workflow triggers on publish)
```

The release helper requires Node 24.15+ on the Node 24 line (or a version
supported by the pinned Angular benchmark compiler). It changes the version
before building and commits the versioned distribution, documentation and
benchmark bundles together. Publishing the GitHub Release runs the same checks
and attaches the compiled archives. npm publishing remains a separate command.

## Development

```bash
npm run build
npm test
```

Package outputs:
- `dist/gtpl.esm.js`
- `dist/gtpl.cjs`
- `dist/gtpl.global.js`
- `dist/gtpl.d.ts`

## Security Notes

- `g-inner` writes directly to `innerHTML`; use trusted HTML only.
- JIT compilation executes generated code (`GCompile`), so compile only trusted template sources.
- Use `GCodeSafe` + `GCompileSafe` when templates are not fully trusted.

## Attribution

If you use GTPL in a product or publication, a short attribution is appreciated:

`Powered by GTPL (https://github.com/garag-lib/GTPL)`

For formal attribution details, see [NOTICE](NOTICE) and [CITATION.cff](CITATION.cff).

## License

Apache-2.0
