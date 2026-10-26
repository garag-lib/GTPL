# Benchmark Lab

Open `../benchmarks.html` through HTTP. The page is linked from `docs/index.html`
and works as a static GitHub Pages site, including under the `/GTPL/` subpath.
All runtime assets are local; no CDN requests or build server are required to run it.

From the repository root:

```sh
node scripts/benchmarks/serve.mjs
# http://127.0.0.1:4173/benchmarks.html
```

## Rebuild after changing GTPL or the workload

Node 24.15+ (or a version supported by the pinned Angular compiler) is required.
The build dependencies are separate from the library's dependencies.

```sh
npm ci --prefix scripts/benchmarks
node scripts/benchmarks/build.mjs
node --test scripts/benchmarks/*.test.mjs
```

Commit the regenerated `vendor/`, `manifest.json`, `templates.json`, and the build
lockfile when publishing a change. The manifest records versions, SHA-256 of the
GTPL source tree and each output, and raw/gzip sizes of the actual bundles. These
sizes include the workload adapter, not just the minimal framework runtime.
Third-party legal notices are emitted alongside the vendor bundles.

`build.mjs` compiles GTPL and Vue templates offline and invokes Angular's real
AOT compiler. React is bundled in production mode; Angular excludes its runtime
compiler and Zone.js. GTPL JIT deliberately compiles on every mount. Alpine
interprets its HTML directives at mount. Framework and transitive versions are
fixed by `scripts/benchmarks/package-lock.json`.

## What is measured

- Identical data, styles and row structure in all adapters. Twelve conditional
  branches, one active, N rows, three cells per row. Native wrapper elements,
  comments and inert template declarations can differ and are reported honestly.
- Each sample starts with a fresh iframe and imported runtime. A discarded
  20-row instance warms it before the measured mount. Downloads and module
  evaluation are excluded; this is not cold navigation performance.
- Samples alternate A/B and B/A with a random starting engine. One iframe runs
  at a time at the same viewport size. Frames are visible, never `display:none`.
- Timing ends when the first/last expected cells exist and layout has been
  requested. A full row-by-row verification follows, outside the stopwatch.
  Incorrect output invalidates the sample rather than receiving a zero score.
- React uses `flushSync`, Angular `detectChanges`, Vue its update queue, and
  Alpine/GTPL their reactive updates. Timings measure confirmed DOM work and
  layout, not interactive scheduling latency or time to painted pixels.
- Updates report the median of 10 counter changes across all rows. Switch
  reports 11 first visits and 12 revisits independently. All candidates use
  conditional construction; no CSS show/hide comparison.
- Fluency measures rAF cadence for 1.2 seconds while all rows update once per
  frame, on a freshly mounted view. Full verification happens after animation. Display refresh rate limits
  FPS; p95 intervals and the proportion exceeding 1.5× idle cadence provide
  context. These are not GPU render FPS or a universal framework throughput score.
  A quotient is omitted if fewer than 12 frames were observed in a sample or
  the two engines' idle cadences differ substantially. Raw values remain visible.
- The chart shows medians between samples, with raw operation timings, frame
  intervals, run order, errors and environment in JSON. CSV provides one row per
  engine/sample/metric; absent values remain blank. No results persist or upload.
- Losing visibility, scrolling the executor out of view or resizing aborts the run; explicit Stop discards the
  incomplete sample and preserves completed samples. Errors never become zeros.

## Memory

Click **Activar medición de memoria** to open the isolated lab, including on
GitHub Pages. `isolated.html` opts into a first-party service worker scoped only
to `benchmarks/`. It fetches resources from the network, adds COOP/COEP headers,
and opens `lab.html`, generated from the same benchmark HTML with a corrected
asset base (including a fallback for hard refreshes). It does not cache files or results and leaves the documentation
outside its scope unchanged. HTTPS (or localhost) and a compatible browser are
required. Unsupported memory APIs remain explicitly **N/D**.

For a compatible browser locally, headers can also be supplied directly:

```sh
node scripts/benchmarks/serve.mjs --isolated
```

The runner records snapshots after warm-up, after mount and after switch revisits.
Charts show memory attributed to the mounted view (including its runtime),
the change from warm-up, and growth after 23 branch changes.
It sums only entries whose attributions all point to that runner's exact URL;
shared/unattributed entries and the parent page are excluded. This is attributed
memory, not total RAM or retained memory. GC is not controlled, and negative
deltas are kept. Three measurements may add a minute or more per sample. They run
outside the timing window. There is deliberately no memory winner or global score.

## Check a release

1. Rebuild, run the statistics tests, and serve over HTTP.
2. Run every engine with 100 rows, all four scenarios and at least 3 samples.
   Check that samples validate, values are finite, and the console has no errors.
3. Test 500/1,000 rows, Stop, switching rival/scenarios, same-engine selection,
   JSON/CSV downloads, and the link from the documentation.
4. Inspect desktop and 390px mobile widths. Controls, code and charts must fit.
5. In an isolated compatible browser, enable memory and confirm attributed
   measurements or explicit N/D; never substitute shared heap estimates.

The lifecycle regression test runs the real compiler and DOM in jsdom. It checks
that switch branches own their loop rows and release their inherited bindings
across repeated visits, preventing work and retained memory from accumulating.

Code snippets are illustrative three-state examples, include setup and updates,
and omit tool configuration. Line counts describe those snippets, not a universal
measure of programming ease. The benchmark's exact templates and bundles are
linked on the page; the readable adapters live in `scripts/benchmarks/build.mjs`.

## Growing grid

Select **Grid creciente** to measure an X-by-Y grid at successively larger
sizes. Both axes grow by the configured step, up to 128 by 128 cells. The
default changes every cell on every animation frame; 10% and 25% densities
select a reproducible random subset without replacement. A seeded generator
uses the same sequence prefix for every engine and level. Every selected cell
receives a different numeric value, with its CSS color derived from that value.

Each cell has independent reactive state: a GTPL instance, a React component
with local state, a Vue component with its own reactive model, an Angular
OnPush component reading a signal, or an Alpine x-data scope. Vanilla DOM is a
manual reference. This isolates granular updates from list reconciliation;
the original row/switch scenarios still exercise list directives separately.
The readable adapters are in `scripts/benchmarks/grid-adapters.mjs`.

Each engine/sample gets a fresh iframe for the grid, and each size gets a fresh
component tree after a discarded 4-by-4 warm-up. The complete grid fits inside
the same visible viewport. Mounting, module loading and full final verification
are excluded from FPS. One shared rAF loop includes random workload generation,
state updates, DOM confirmation and layout. The cached first and last changed
cell references confirm each batch; every cell is checked against the seeded
model after each level. Incorrect output rejects the sample. JSON retains raw
frame intervals, update/generator timings, frame counts, checksums and seeds.
CSV adds `grid.*` metric rows and the exact dimensions.

The chart compares median FPS, p95 frame interval, updates per second or update
time against cell count. FPS are capped by display refresh and browser
scheduling. Samples with few observed frames are labeled as unstable. This is
rAF cadence, not a direct GPU paint counter. Memory and bundle sizes in the
original section describe the row/switch workload, not the separate grid bundles.
