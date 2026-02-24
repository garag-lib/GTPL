# GTPL

Reactive template library with direct DOM updates and Proxy-based reactivity.

GTPL is a TypeScript library for reactive template systems built around Direct DOM and Proxy. Inspired by Vue, Angular AOT, and JSX, it delivers efficient reactive UI updates in a compact 11kB JavaScript package.

GTPL provides:
- A small runtime for reactive rendering.
- Template compilation in two modes: JIT (runtime) and AOT (precompiled).
- Built-in directives for conditional rendering, loops, switching, styles, and dynamic attributes.

Interactive examples: https://garag-lib.github.io/GTPL/

## Installation

```bash
npm install gtpl
```

## Quick Start (JIT)

```ts
import gtpl from 'gtpl';

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
import gtpl from 'gtpl';

const { GTpl, GregisterDirective, jit: { GCode, GCompile } } = gtpl;
```

Main pieces:
- `GCode(html)`: parses template HTML into generated code string.
- `GCompile(code)`: compiles generated code into a render function.
- `new GTpl({ root, generator })`: creates reactive instance.
- `instance.addTo(node)`: mounts rendered nodes.
- `instance.watch(path, cb)`: subscribes to reactive path changes.
- `instance.refresh()`: triggers recomputation.
- `instance.destroy()`: removes listeners, bindings, and rendered nodes.
- `GregisterDirective(name, class)`: register custom directive.

## Browser Global Build

If you use the global bundle (`dist/gtpl.global.js`):

```html
<script src="dist/gtpl.global.js"></script>
<script>
  const { GTpl, jit: { GCode, GCompile } } = gtpl;
</script>
```

## Releases (Precompiled Builds)

GitHub Releases include precompiled `dist/` artifacts (`.zip` and `.tar.gz`), so consumers can download ready-to-use
bundles without building locally:

https://github.com/garag-lib/GTPL/releases

To publish a new release (maintainer flow):

```bash
git tag v1.1.2
git push origin v1.1.2
```

## Development

```bash
npm run build
npm test
```

Package outputs:
- `dist/gtpl.esm.js`
- `dist/gtpl.cjs.js`
- `dist/gtpl.global.js`
- `dist/gtpl.d.ts`

## Security Notes

- `g-inner` writes directly to `innerHTML`; use trusted HTML only.
- JIT compilation executes generated code (`GCompile`), so compile only trusted template sources.

## Attribution

If you use GTPL in a product or publication, a short attribution is appreciated:

`Powered by GTPL (https://github.com/garag-lib/GTPL)`

For formal attribution details, see [NOTICE](NOTICE) and [CITATION.cff](CITATION.cff).

## License

Apache-2.0
