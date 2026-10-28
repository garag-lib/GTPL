# Benchmark Lab

Open `../benchmarks.html` through HTTP. It is linked from `docs/index.html`
and works on GitHub Pages, including under `/GTPL/`. Runtime assets are local.

```sh
node scripts/benchmarks/serve.mjs
# http://127.0.0.1:4173/benchmarks.html
```

Choose two engines, then one programming pattern. Each has its own workload and
metrics. The interactive lab reports them separately; it does not mix timing,
memory and FPS into a universal framework score.

The language selector switches the complete interface between English and Spanish,
including results, charts and validation messages. Use `?lang=en` or `?lang=es`
to share a language; the choice is also saved locally. Switching after a run keeps
its measured data. The selector is disabled during a run to keep the controller
stable for memory readings. Language changes only the interface, not the measured
fixtures, operations or validation rules.

## General comparison across engines

The [measured comparison](general-performance.md) separates a six-case DOM latency
index from grid stress tests and JavaScript heap measurements. Every raw sample,
version, bundle hash and validation result is retained in
[general-results.json](general-results.json).
The descriptive latency index gives each DOM case equal weight, and splits its
weight equally between mounting and operations. It applies only to those cases;
memory and grid/FPS remain separate.

```sh
PLAYWRIGHT_MODULE=/absolute/path/playwright/index.mjs SAMPLES=5 HEAP_SAMPLES=3 \
  node scripts/benchmarks/rank.mjs
node scripts/benchmarks/rank-report.mjs
```

To recompute the report from the saved data without running Chrome again:

```sh
node scripts/benchmarks/rank-report.mjs docs/benchmarks/general-results.json /tmp/gtpl-ranking-report
```

Run it sequentially, without concurrent builds or tests. The runner checks the
published bundle hashes before measuring. Heap is a separate CDP/forced-GC pass;
it excludes native DOM memory and must not be called total browser RAM. Grid
cadence with fewer than twelve frames per sample needs a longer confirmation.

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
On this branch, every GTPL benchmark (AOT and JIT, methods and grid) uses
`GCodeOptimized(template, { methodAliases: true })`. The library's default
compiler behavior is unchanged. `manifest.json` records this under `gtplCompiler`.
The standalone `aot.mjs prepare` defaults to the same configuration and writes
`config.json` beside each preparation; use `BACKEND=legacy` for the original
compiler or `METHOD_ALIASES=0` to compare the imperative backend without aliases.

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
4. Inspect desktop and 390px mobile layouts, including progress and charts.
5. In an isolated compatible browser, verify snapshots or explicit N/D, preserved
   activation-link parameters and the GitHub Pages subpath.

The page omits code extracts and compiled-source links: partial examples were
not complete runnable programs and the extra source panel duplicated only one
contender. Complete benchmark definitions and adapters remain in
`scripts/benchmarks/`; the exported manifest identifies every measured asset.
The library lifecycle regression checks ownership/destruction of switch/list
instances across visits.

## Svelte

Svelte se fija a la versión indicada en `scripts/benchmarks/package.json` y se compila durante el build con `dev: false`, `generate: 'client'` y runes. El compilador no forma parte de los bundles del navegador. Los switch usan cadenas nativas `{#if}/{:else if}` con 8, 32 o 64 árboles explícitos, cada uno con los mismos 128 bloques. Las listas usan claves, los formularios `bind:value` y la cuadrícula un componente por celda.

El adaptador utiliza `mount`, `unmount` y `flushSync` para incluir el trabajo de DOM en cada operación, igual que la confirmación explícita de React/Angular. El ejecutor conserva sus validaciones compartidas de DOM, retirada, actualizaciones y muestras de memoria. Las definiciones HTML de las ramas pueden permanecer cargadas; no se confunden con nodos insertados en la vista. Los tamaños y las dependencias transitivas de cada entrada se registran en el manifest.

### Esperas durante las lecturas de memoria

Una comparación de switch de 32/64 ramas puede parecer detenida mientras Chrome resuelve `measureUserAgentSpecificMemory`. La lectura puede tardar varios segundos incluso con el ejecutor vacío. La cabecera de la vista real muestra ahora la fase, el tiempo transcurrido y el límite; la barra permanece indeterminada mientras se espera, sin presentar ese tiempo como progreso porcentual ni como coste de renderizado. Al terminar o detener la ejecución, vuelve al número de muestras completas. El límite y la recuperación sin memoria siguen vigentes: las lecturas ausentes se exportan como N/D, nunca como cero.

El empaquetado fija las condiciones `browser`, `module` y `production`, además de `dev: false` en el compilador de Svelte. Esto resuelve `esm-env` durante el build y desactiva las comprobaciones de desarrollo que antes dependían de un global del navegador.

### Reloj y límite de la muestra completa

El contador acompaña toda la muestra y no se apaga al terminar una lectura: sigue durante la carga del módulo, el montaje, las operaciones y la limpieza. Cada fase aparece identificada junto al ejecutor. Hay dos límites distintos: 30 segundos por lectura de la API y un presupuesto global de 120 segundos para carga/operaciones, más 30 segundos por fase de memoria. Un switch normal dispone de 210 segundos; con retención, o un if, de 240 segundos. Esto da tiempo a todas las lecturas y evita tratar 30 segundos como límite de la prueba entera.

Al agotar el presupuesto global se elimina el iframe, se registra la fase del fallo y se avanza a la siguiente muestra; no se omiten automáticamente todas las rondas de ese motor. El botón Detener cancela también el reloj. Las esperas de lecturas no se cuentan como tiempo de montaje o actualización. Como cualquier temporizador JavaScript, el aviso puede despacharse con retraso si el navegador bloquea su hilo principal durante compilación o GC; el contador usa tiempo transcurrido real al reanudarse.

### Grid timing contract

`updateMs` includes the adapter call, any Promise it returns, confirmation of
**all cells changed in that batch**, and a forced layout read. It does not stop
when GTPL finishes assigning state. Vue's `nextTick()` remains part of this same
interval. `dispatchMs` / `raw.dispatchTimes` separately record only the immediate
adapter call; they are diagnostics and exclude any later asynchronous work.
The grid source gives each selected cell a distinct index per frame: batching
repeated writes cannot by itself reduce that frame's two dynamic value bindings
per GTPL cell. All selected cells are checked again against the complete model
at the end of each level.

`applyMs` / `raw.applyTimes` include the call, returned Promise and all modified
DOM outputs up to the layout read; `layoutMs` / `raw.layoutTimes` measure that
forced layout read separately. `updateMs` remains the full interval. These phases
help distinguish runtime work from browser style/layout cost; their independent
medians need not sum exactly to the median complete interval.

## Flutter Web (Grid only)

Flutter Web is available on either side only when Grid is selected. The published
release build uses Flutter **3.47.8**, Dart compiled to JavaScript (`dart2js`) and
**CanvasKit full**, with the engine, Wasm and fonts served locally. There is no SDK
or compilation in the browser. Other cases and the general DOM index exclude it.

It runs the same seeded JavaScript workload, densities and size sweep. Each cell
has an independent `ValueNotifier<int>` and `ValueListenableBuilder`; all cells
are mounted, without virtualization or a single custom painter. The geometry,
colour palette, text and clipping follow `grid.css`. A small grid warms the engine
before measurements; loading, engine initialization and mounting are excluded.

The Flutter update Promise awaits `WidgetsBinding.endOfFrame`. Validation reads
values recorded by the cell builders, checking the changed batch each frame and
the whole grid at each level. This confirms widget output after Flutter's frame;
it is not pixel readback or GPU completion. The DOM engines retain their existing
DOM mutation + forced layout fence before paint. Consequently Flutter's
`updateMs` includes frame scheduling and its build/layout/paint submission, while
DOM timings exclude paint. These boundaries appear in the UI and exported JSON;
do not interpret the update times as equivalent CPU costs. Flutter cadence uses
its completed frames without adding a second rAF wait. `layoutMs` is only the
host element's DOM layout read; Flutter layout is already inside `applyMs`.

Normal npm builds preserve the precompiled Flutter entry without needing its SDK.
To explicitly rebuild it, temporarily install the pinned SDK and run:

```sh
FLUTTER_BIN=/absolute/path/flutter/bin/flutter node scripts/benchmarks/build-flutter.mjs
```

Commit the Dart sources, `pubspec.lock`, adapter, `vendor/flutter/` and updated
`manifest.json`. The Flutter size includes its application, CanvasKit, fonts and
notices; the manifest records each asset's size and SHA-256. Sources are in
`scripts/benchmarks/flutter/`. The SDK can be removed after compilation.
