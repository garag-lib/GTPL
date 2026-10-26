# Benchmark Lab

Open `../benchmarks.html` through HTTP. It is linked from `docs/index.html`
and works on GitHub Pages, including under `/GTPL/`. Runtime assets are local.

```sh
node scripts/benchmarks/serve.mjs
# http://127.0.0.1:4173/benchmarks.html
```

Choose two engines, then one programming pattern. Each has its own workload,
code examples and metrics. There is no combined framework score.

## Build and publish

Use Node 24.15+ (or a version supported by the pinned Angular compiler).
Benchmark dependencies are separate from the library dependencies.

```sh
npm ci --prefix scripts/benchmarks
node scripts/benchmarks/build.mjs
node --test scripts/benchmarks/*.test.mjs
```

Commit regenerated `vendor/`, `methods/`, `lab.html`, `manifest.json`,
`templates.json` and the benchmark lockfile when publishing changes.
The manifest records versions, GTPL source hash, output SHA-256 and raw/gzip
sizes. Method sizes include the entry and its transitive shared modules, not
just the framework runtime. Legal notices accompany generated bundles. Explicit
switch trees intentionally produce substantial source files; a runner imports
only the chosen pattern and variant.

`method-definitions.mjs` generates native templates and React render functions.
`method-adapters.mjs` supplies readable adapters and bundles their modules.
GTPL AOT, Svelte and Vue templates are precompiled. Angular uses its real AOT compiler,
without the runtime compiler or Zone.js. React uses production mode. GTPL JIT
compiles at mount; Alpine interprets HTML at mount. Dependencies are pinned in
`scripts/benchmarks/package-lock.json`.

## Patterns

| Pattern       | Workload                                                                                                   | Main question                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Switch        | 8/32/64 explicit branches, each with 128 HTML blocks; initially none active, then only the selected branch | Memory of definitions, one active view and inert templates |
| For           | Update values, append 25%, remove half, reverse, replace identifiers                                       | Native list updates and reconciliation                     |
| If            | Create, remove, revisit and remove a 128-block view                                                        | Construction cost and memory after hiding                  |
| Inline styles | Change background, foreground and width on existing elements                                               | Update latency, layout and rAF cadence                     |
| Classes       | Alternate two CSS classes on existing elements                                                             | Class updates and layout                                   |
| Attributes    | Change title, data-state, aria-label and text                                                              | Attribute and text bindings                                |
| Forms         | Native input propagates to the model, all inputs and an output                                             | Bidirectional input-to-view propagation                    |
| Grid          | Grow both dimensions; update a seeded random subset each frame                                             | Granular state updates as cell count grows                 |

### Switch is primarily a memory experiment

Every branch has explicit titles, paragraphs, reactive values and lists. There
is no shared `for` that builds the branch from data. Variants have separate
entries: choosing 8 does not import definitions for 64.

GTPL uses `g-switch`/`g-case`, React a JavaScript switch with render instructions
inside each selected case, Vue a `v-if`/`v-else-if` chain, Angular `@switch`,
Alpine `x-if` templates, and vanilla DOM parses only the chosen HTML. All use
conditional construction. Definitions, source literals and compiled instructions
still reside in memory when their branch is inactive.

The default never visits other branches. It counts connected elements and 128
active blocks, and separately traverses `template.content` for inert elements
and blocks. Inert content is disconnected but its DOM nodes exist. The optional
retention test visits every branch, removes the view and records another memory
snapshot. Creation time is secondary, in the table. There is no switch speed
winner or overall score.

## Measurement and validation

Each engine/sample uses a fresh visible iframe. The selected method module is
imported after the empty-runner memory baseline and before the mount stopwatch.
Methods measure the first mount; they do not reuse the old generic suite's
warm-up tree. Downloads and module evaluation are excluded from timing. Samples
alternate A/B and B/A, with a randomized starting engine.

React uses `flushSync`, Angular `detectChanges`, Vue its update queue, and
Alpine/GTPL their native reactive updates. Timed operations wait for the expected
DOM and request layout. Full validation follows outside the stopwatch. This
measures confirmed DOM/layout work, not time to painted pixels or interactive
scheduling latency. Incorrect output rejects the sample.

For takes the median of three operations of each type, resetting the base list
before each. Styles, classes, attributes and forms measure ten updates, followed
by rAF cadence for 1.2 seconds. Forms use the prototype's native value setter and
a bubbling input event to exercise binding. Native wrappers, list semantics and
inert declarations can differ. React, Svelte, Vue, Angular and Alpine use keys; GTPL uses
its native list directive. Complete order and values are validated.

Charts show medians, with p95 and ranges in the table. JSON schema 2 retains
operation times, intervals, memory breakdowns, DOM snapshots, exact configuration,
manifest, execution order and errors. CSV has one row per metric or snapshot;
missing values remain blank. Results are neither uploaded nor persisted. Stop
preserves completed samples. Losing visibility, resizing or scrolling the
executor away aborts the run.

## Memory

Click **Activar medición de memoria** to open the isolated lab, preserving the
pattern and switch configuration. A first-party service worker scoped only to
`benchmarks/` adds COOP/COEP headers to network responses, then opens `lab.html`,
generated from the main HTML with a corrected asset base. The worker does not
cache files or results. HTTPS/localhost and `measureUserAgentSpecificMemory`
support are required; unsupported values stay N/D. Alternatively:

```sh
node scripts/benchmarks/serve.mjs --isolated
```

Snapshots record the empty runner before import, mounted initial state, active
view and optionally removed view. Charts use differences of the API's total
environment bytes, including JS and DOM. The parent holds charts/results stable
throughout each sample; only the progress status text changes. This includes shared/unattributed DOM costs missed by an
iframe-URL-only sum. It is an experimental estimate, not exact framework
attribution or Chrome process RAM. Shared memory and uncontrolled GC introduce
noise; negative deltas remain visible and memory is never ranked as a winner.

The full breakdown and bytes exclusively attributed to the iframe URL are also
exported. Definitions minus baseline estimates runtime/code/template residency;
active minus definitions estimates activation; active minus baseline estimates
their combined cost. Retired minus initial can show caches/retention but does not
prove a leak. API calls may wait tens of seconds and a sample may take minutes.
Memory reads are outside timed operations. The grid does not measure memory.

The UI reports the current memory phase, completed phase count and elapsed wait.
Each read has a 30-second deadline. If it expires, the pending browser request
cannot be cancelled, so its iframe is removed and that sample is run again in a
fresh iframe without memory. Remaining samples in the same comparison also skip
memory to avoid repeated waits. DOM and timings must still validate; missing RAM
stays N/D. A new comparison retries the memory API. JSON records `memoryWarnings`
and per-sample `memoryStatus`; CSV includes status and reason rows. Ordinary DOM
errors remain failures, and Stop never triggers a retry.

Chromium may wait for garbage collection before resolving a measurement; several
sequential snapshots can legitimately take minutes. See the browser's
[measurement timing documentation](https://web.dev/articles/monitor-total-page-memory-usage#local_testing).

## Growing grid

Both axes grow by the configured step, up to 128 by 128. By default every cell
changes each frame; 10%/25% select reproducible subsets without replacement. A
seeded generator gives each engine the same sequence prefix. Selected values
change on each update and determine CSS color.

Each cell has independent state: a GTPL instance, React local state, Vue reactive
model, Angular OnPush component with a signal, or Alpine x-data scope. Vanilla
DOM is a manual reference. This measures granular state; For measures list
reconciliation separately. Readable adapters: `scripts/benchmarks/grid-adapters.mjs`.

Each level uses a fresh tree after a discarded 4-by-4 warm-up. The complete grid
fits in the same visible executor without virtualization. The rAF loop includes
random generation, updates, DOM confirmation and layout. Mount, imports and full
final validation are excluded. Every cell must match the seeded model. JSON
retains intervals, generator/update timings, frame counts, checksums and seeds.
CSV includes dimensions and per-level metrics.

FPS are capped by display refresh and browser scheduling. Few observed frames
are marked unstable. Cadence is not a GPU counter or universal throughput score.

## Check a change

1. Build and run library and benchmark tests.
2. Exercise all engines/patterns, each switch variant, a nonzero chosen branch,
   and optional retention. All samples must validate.
3. Test configuration changes, same-engine selection, Stop and JSON/CSV exports.
4. Inspect desktop and 390px mobile layouts, including code and charts.
5. In an isolated compatible browser, verify snapshots or explicit N/D, preserved
   activation-link parameters and the GitHub Pages subpath.

Examples are excerpts of the selected pattern. Line counts describe that excerpt,
not a universal measure of programming ease. Complete readable definitions,
adapters and the executed module are linked on the page. The library lifecycle
regression checks ownership/destruction of switch/list instances across visits.

## Svelte

Svelte se fija a la versión indicada en `scripts/benchmarks/package.json` y se compila durante el build con `dev: false`, `generate: 'client'` y runes. El compilador no forma parte de los bundles del navegador. Los switch usan cadenas nativas `{#if}/{:else if}` con 8, 32 o 64 árboles explícitos, cada uno con los mismos 128 bloques. Las listas usan claves, los formularios `bind:value` y la cuadrícula un componente por celda.

El adaptador utiliza `mount`, `unmount` y `flushSync` para incluir el trabajo de DOM en cada operación, igual que la confirmación explícita de React/Angular. El ejecutor conserva sus validaciones compartidas de DOM, retirada, actualizaciones y muestras de memoria. Las definiciones HTML de las ramas pueden permanecer cargadas; no se confunden con nodos insertados en la vista. Los tamaños y las dependencias transitivas de cada entrada se registran en el manifest.
