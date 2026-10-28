# GTPL frente a los demás: medición general

Tanda: 2026-10-28T13:21:33.245Z → 2026-10-28T13:37:30.095Z. Revisión medida: `5db2aba7c7638ff671e33902a2b51ba190418cb9`.
Chrome 156.0.8078.47, Intel(R) Core(TM) i5-2400S CPU @ 2.50GHz, 4 cores; viewport 960×190, DPR 1. 560 muestras válidas, 0 fallos.
Confirmación independiente del grid: 24 muestras válidas, 0 fallos. Total: 584.

## Puesto de latencia

Índice descriptivo de estos seis casos DOM, no una clasificación universal de bibliotecas. JavaScript directo = 1; menor es mejor. Cada caso pesa 1/6. Dentro de cada caso, montaje y operaciones pesan 1/2 cada uno; las operaciones de lista y condicional se reparten su mitad por igual. Se usa la media geométrica de cocientes entre medianas. Descarga/importación no se cronometran; la compilación JIT durante mount sí. Memoria, FPS y switch no se mezclan en este índice.

| Puesto entre 8 modos | Motor/modo | Índice latencia | Montaje | Operaciones | IC bootstrap 95% |
|---|---|---|---|---|---|
| 1 | JavaScript directo | 1.00 | 1.00 | 1.00 | 1.00–1.00 |
| 2 | React | 1.92 | 3.34 | 1.10 | 1.74–1.94 |
| 3 | Vue | 2.03 | 3.26 | 1.26 | 1.81–2.15 |
| 4 | Angular | 2.24 | 4.87 | 1.03 | 2.00–2.28 |
| 5 | Svelte | 2.24 | 4.15 | 1.21 | 1.98–2.35 |
| 6 | GTPL AOT | 2.32 | 4.37 | 1.23 | 2.15–2.40 |
| 7 | GTPL JIT | 2.81 | 6.54 | 1.21 | 2.52–2.93 |
| 8 | Alpine | 4.89 | 9.32 | 2.57 | 4.32–4.94 |

Entre los seis frameworks en su modo de producción, excluyendo JavaScript directo y la variante GTPL JIT, GTPL AOT queda **5.º de 6**.

Los intervalos son exploratorios (2.000 remuestreos emparejados por ronda, n=5); intervalos superpuestos y diferencias pequeñas no justifican un ganador estadístico. No se eliminan muestras lentas. Todas deben pasar validación completa de salida y limpieza.

## Por caso

Posiciones por índice combinado del caso; operaciones = media geométrica de las operaciones declaradas, normalizadas frente a JavaScript directo. Valores relativos, no milisegundos.

| Caso | GTPL AOT: puesto/8 | GTPL JIT: puesto/8 | Mejor framework de producción | GTPL AOT montaje | GTPL AOT operaciones |
|---|---|---|---|---|---|
| Lista de 500 filas | 6 | 7 | Vue | 1.86 | 0.89 |
| Condicional, 128 bloques | 3 | 8 | Svelte | 28.12 | 1.14 |
| Estilos, 500 elementos | 6 | 7 | React | 4.33 | 1.47 |
| Clases, 500 elementos | 4 | 6 | React | 3.26 | 1.27 |
| Atributos/texto, 500 elementos | 5 | 6 | React | 3.77 | 1.47 |
| Formulario, 500 campos | 7 | 6 | Vue | 2.48 | 1.24 |


### Medianas absolutas de operaciones (ms)

| Caso / operación | GTPL AOT | GTPL JIT | React | Svelte | Vue | Angular | Alpine | JavaScript directo |
|---|---|---|---|---|---|---|---|---|
| for-500 / mountMs | 69.975 | 74.550 | 48.320 | 60.895 | 43.830 | 56.500 | 156.120 | 37.525 |
| for-500 / updateMs | 18.415 | 18.700 | 12.435 | 18.855 | 15.105 | 11.575 | 41.010 | 20.795 |
| for-500 / appendMs | 15.490 | 15.130 | 8.600 | 18.130 | 8.835 | 6.740 | 60.205 | 27.045 |
| for-500 / removeMs | 10.290 | 9.865 | 6.145 | 7.505 | 7.995 | 5.555 | 24.150 | 9.000 |
| for-500 / reverseMs | 21.535 | 22.240 | 19.625 | 37.635 | 19.800 | 19.775 | 42.540 | 18.000 |
| for-500 / replaceMs | 22.000 | 21.140 | 22.955 | 27.475 | 21.870 | 22.970 | 87.920 | 27.885 |
| if / mountMs | 6.890 | 49.705 | 10.325 | 4.560 | 8.305 | 15.635 | 7.600 | 0.245 |
| if / showMs | 44.645 | 44.950 | 43.620 | 37.370 | 45.545 | 48.130 | 54.360 | 33.875 |
| if / hideMs | 1.825 | 1.825 | 4.800 | 2.135 | 2.045 | 2.315 | 4.745 | 1.515 |
| if / revisitMs | 25.790 | 25.420 | 34.810 | 26.970 | 29.655 | 29.725 | 38.795 | 27.310 |
| styles / mountMs | 46.035 | 49.850 | 26.290 | 41.565 | 31.375 | 42.240 | 100.070 | 10.620 |
| styles / updateMs | 13.310 | 12.825 | 10.000 | 11.107 | 16.665 | 10.168 | 36.748 | 9.043 |
| classes / mountMs | 30.190 | 34.435 | 21.785 | 35.830 | 22.215 | 43.525 | 87.425 | 9.270 |
| classes / updateMs | 10.565 | 10.380 | 9.293 | 9.968 | 10.355 | 11.030 | 18.327 | 8.310 |
| attributes / mountMs | 48.650 | 57.300 | 28.965 | 55.325 | 30.410 | 41.015 | 147.665 | 12.895 |
| attributes / updateMs | 15.653 | 15.207 | 10.980 | 17.275 | 16.090 | 10.372 | 39.488 | 10.658 |
| forms / mountMs | 54.345 | 54.850 | 42.645 | 56.895 | 39.935 | 50.910 | 108.845 | 21.870 |
| forms / inputMs | 14.670 | 14.505 | 14.832 | 13.220 | 15.173 | 12.050 | 21.758 | 11.840 |


## Grid: pruebas de estrés separadas

Misma granularidad que los adaptadores publicados. Cada muestra empieza con calentamiento de 4×4, usa semilla 42 y mide todas las celdas modificadas, más layout. Animación solicitada de 1,5 s por nivel; una operación larga puede excederla. Los FPS están limitados por rAF/pantalla. Menos de 12 frames en una muestra implica una cadencia insuficientemente estable; la cifra sigue registrada, no se convierte en un ganador de FPS.

| Grid / % | GTPL AOT update (ms) | Puesto GTPL AOT /8 | Mejor update | GTPL AOT FPS | Mín. frames GTPL AOT |
|---|---|---|---|---|---|
| 16x16-100 | 11.835 | 2 | React | 58.02 | 87 |
| 32x32-100 | 45.273 | 6 | React | 15.65 | 22 |
| 48x48-100 | 110.210 | 6 | React | 6.88 | 10 |
| 64x64-100 | 190.622 | 4 | React | 3.91 | 6 |
| 64x64-10 | 27.780 | 5 | JavaScript directo | 15.65 | 23 |


### 16x16-100

| Motor | Update ms [mín–máx] | FPS [mín–máx] | Frames mínimos |
|---|---|---|---|
| GTPL AOT | 11.835 [10.862–12.520] | 58.024 [57.365–59.343] | 87 |
| GTPL JIT | 12.542 [11.170–12.675] | 58.024 [58.024–58.684] | 88 |
| React | 11.150 [10.675–11.388] | 58.684 [58.684–59.343] | 89 |
| Svelte | 11.853 [11.110–12.150] | 58.024 [58.024–58.684] | 88 |
| Vue | 13.695 [12.498–13.885] | 54.133 [53.409–56.706] | 81 |
| Angular | 11.865 [10.705–12.502] | 58.684 [56.706–58.684] | 86 |
| Alpine | 19.585 [18.370–19.948] | 40.881 [40.881–43.518] | 62 |
| JavaScript directo | 12.260 [10.705–12.665] | 58.684 [58.024–59.343] | 88 |


### 32x32-100

| Motor | Update ms [mín–máx] | FPS [mín–máx] | Frames mínimos |
|---|---|---|---|
| GTPL AOT | 45.273 [41.828–52.142] | 15.653 [14.043–16.957] | 22 |
| GTPL JIT | 44.770 [41.790–45.343] | 15.958 [15.653–16.957] | 24 |
| React | 41.807 [39.245–45.040] | 16.775 [15.320–17.803] | 24 |
| Svelte | 44.125 [40.555–45.258] | 16.305 [15.825–17.420] | 24 |
| Vue | 50.005 [46.675–51.452] | 14.681 [14.348–15.653] | 22 |
| Angular | 42.765 [39.675–43.160] | 16.484 [16.130–17.420] | 25 |
| Alpine | 73.565 [66.575–75.260] | 10.737 [9.783–11.740] | 15 |
| JavaScript directo | 43.617 [41.047–44.430] | 15.825 [15.825–16.775] | 24 |


### 48x48-100

| Motor | Update ms [mín–máx] | FPS [mín–máx] | Frames mínimos |
|---|---|---|---|
| GTPL AOT | 110.210 [105.218–118.873] | 6.875 [6.250–7.273] | 10 |
| GTPL JIT | 106.025 [100.650–108.195] | 6.948 [6.875–7.273] | 11 |
| React | 96.745 [92.685–109.090] | 7.273 [7.022–7.826] | 11 |
| Svelte | 102.535 [93.510–109.585] | 7.174 [6.948–7.579] | 11 |
| Vue | 114.578 [104.850–127.117] | 6.383 [6.061–6.875] | 10 |
| Angular | 102.420 [94.515–112.085] | 7.022 [6.735–7.742] | 11 |
| Alpine | 183.545 [168.840–184.880] | 4.616 [4.528–5.000] | 7 |
| JavaScript directo | 99.975 [94.237–108.680] | 6.948 [6.875–7.347] | 11 |


### 64x64-100

| Motor | Update ms [mín–máx] | FPS [mín–máx] | Frames mínimos |
|---|---|---|---|
| GTPL AOT | 190.622 [168.450–205.445] | 3.913 [3.637–4.200] | 6 |
| GTPL JIT | 193.670 [167.810–206.847] | 3.913 [3.790–4.243] | 6 |
| React | 176.895 [157.390–191.575] | 4.039 [4.000–4.330] | 7 |
| Svelte | 196.135 [189.995–201.267] | 3.913 [3.889–4.118] | 6 |
| Vue | 205.792 [199.843–228.615] | 3.637 [3.495–3.871] | 6 |
| Angular | 184.605 [168.035–198.212] | 4.000 [3.830–4.286] | 6 |
| Alpine | 311.757 [280.750–319.775] | 2.637 [2.553–2.857] | 4 |
| JavaScript directo | 186.900 [166.110–207.747] | 3.871 [3.530–4.243] | 6 |


### 64x64-10

| Motor | Update ms [mín–máx] | FPS [mín–máx] | Frames mínimos |
|---|---|---|---|
| GTPL AOT | 27.780 [26.510–29.930] | 15.653 [14.681–16.484] | 23 |
| GTPL JIT | 27.795 [26.385–29.565] | 15.484 [14.681–16.484] | 23 |
| React | 27.750 [27.535–29.595] | 15.320 [14.506–15.484] | 22 |
| Svelte | 27.623 [26.085–29.375] | 15.485 [14.348–16.305] | 22 |
| Vue | 30.342 [28.193–31.100] | 14.506 [14.043–15.653] | 22 |
| Angular | 27.535 [26.245–29.365] | 15.484 [14.348–16.305] | 22 |
| Alpine | 39.557 [37.010–41.250] | 13.187 [11.613–14.043] | 18 |
| JavaScript directo | 26.962 [25.050–28.120] | 15.484 [14.527–16.484] | 23 |


### Confirmación más larga del grid de 64×64 al 100 %

La tanda inicial produjo menos de 12 frames por muestra en este estrés. Se repite en una tanda separada de cinco segundos, tres páginas nuevas por motor, con los mismos bundles y validaciones. Se usa semilla 45, igual a la semilla base 42 + nivel 3 del barrido inicial. No se mezclan estas observaciones con las de 1,5 segundos ni con el índice de latencia. Los contadores indican si siguen existiendo pocas observaciones.

| Motor | Update ms [mín–máx] | FPS [mín–máx] | Frames mínimos |
|---|---|---|---|
| GTPL AOT | 190.975 [181.830–203.580] | 3.775 [3.738–4.026] | 19 |
| GTPL JIT | 197.890 [177.305–203.240] | 3.763 [3.642–4.052] | 19 |
| React | 171.055 [168.915–173.008] | 4.039 [3.987–4.172] | 20 |
| Svelte | 189.245 [188.748–201.195] | 3.859 [3.750–3.884] | 19 |
| Vue | 206.378 [205.530–211.202] | 3.495 [3.495–3.518] | 18 |
| Angular | 175.797 [175.583–176.677] | 3.961 [3.948–3.974] | 20 |
| Alpine | 330.675 [329.655–330.885] | 2.549 [2.541–2.557] | 13 |
| JavaScript directo | 198.628 [195.400–200.813] | 3.822 [3.822–3.822] | 20 |


## Heap JavaScript y DOM, separados de los tiempos

Tres muestras por motor/caso, en páginas nuevas. La llamada a readMemory se sustituye únicamente en un módulo virtual del servidor por HeapProfiler.collectGarbage + Runtime.getHeapUsage de CDP. No se modifica ningún archivo del runner publicado ni los adaptadores. Se usa exclusivamente el contador usedSize: no se agregan los otros contadores CDP, que también quedan registrados. El dato es heap V8, excluye memoria DOM nativa, GPU y RSS; NO es measureUserAgentSpecificMemory ni RAM total, y no se interpreta como la residencia completa del código o las plantillas. Los tiempos de esta tanda no entran en el índice. Se registra el hash del módulo original y del instrumento. Se informa de cómo cambia usedSize tras importar las definiciones y montar la vista. Los nodos inertes se cuentan aparte.

### switch-8

| Motor | Heap definiciones Δ MiB | Heap activo Δ MiB | Activación Δ MiB | Retención tras ocultar Δ MiB | Elementos activos | Elementos inertes |
|---|---|---|---|---|---|---|
| GTPL AOT | 0.082 | 0.398 | 0.317 | N/D | 1154 | 0 |
| GTPL JIT | 1.529 | 1.846 | 0.317 | N/D | 1154 | 0 |
| React | 0.915 | 1.318 | 0.402 | N/D | 1154 | 0 |
| Svelte | 0.512 | 0.553 | 0.041 | N/D | 1154 | 0 |
| Vue | 1.246 | 1.616 | 0.370 | N/D | 1154 | 0 |
| Angular | 1.030 | 1.552 | 0.522 | N/D | 1155 | 0 |
| Alpine | 0.323 | 0.992 | 0.669 | N/D | 1162 | 9224 |
| JavaScript directo | 0.379 | 0.392 | 0.013 | N/D | 1153 | 0 |


### switch-32

| Motor | Heap definiciones Δ MiB | Heap activo Δ MiB | Activación Δ MiB | Retención tras ocultar Δ MiB | Elementos activos | Elementos inertes |
|---|---|---|---|---|---|---|
| GTPL AOT | 0.090 | 0.414 | 0.324 | N/D | 1154 | 0 |
| GTPL JIT | 5.437 | 5.757 | 0.321 | N/D | 1154 | 0 |
| React | 2.644 | 3.045 | 0.401 | N/D | 1154 | 0 |
| Svelte | 1.589 | 1.620 | 0.031 | N/D | 1154 | 0 |
| Vue | 4.842 | 5.207 | 0.365 | N/D | 1154 | 0 |
| Angular | 1.511 | 2.034 | 0.523 | N/D | 1155 | 0 |
| Alpine | 0.602 | 1.621 | 1.019 | N/D | 1186 | 36896 |
| JavaScript directo | 1.460 | 1.472 | 0.013 | N/D | 1153 | 0 |


### switch-64

| Motor | Heap definiciones Δ MiB | Heap activo Δ MiB | Activación Δ MiB | Retención tras ocultar Δ MiB | Elementos activos | Elementos inertes |
|---|---|---|---|---|---|---|
| GTPL AOT | 0.102 | 0.436 | 0.334 | N/D | 1154 | 0 |
| GTPL JIT | 10.648 | 10.978 | 0.330 | N/D | 1154 | 0 |
| React | 5.195 | 5.596 | 0.401 | N/D | 1154 | 0 |
| Svelte | 3.013 | 3.044 | 0.031 | N/D | 1154 | 0 |
| Vue | 9.732 | 10.097 | 0.365 | N/D | 1154 | 0 |
| Angular | 2.146 | 2.668 | 0.522 | N/D | 1155 | 0 |
| Alpine | 2.540 | 2.941 | 0.401 | N/D | 1218 | 73792 |
| JavaScript directo | 2.901 | 2.914 | 0.013 | N/D | 1153 | 0 |


### for-500

| Motor | Heap definiciones Δ MiB | Heap activo Δ MiB | Activación Δ MiB | Retención tras ocultar Δ MiB | Elementos activos | Elementos inertes |
|---|---|---|---|---|---|---|
| GTPL AOT | 1.653 | 2.031 | 0.379 | N/D | 1501 | — |
| GTPL JIT | 1.731 | 2.109 | 0.378 | N/D | 1501 | — |
| React | 0.975 | 1.587 | 0.614 | N/D | 1501 | — |
| Svelte | 1.316 | 1.634 | 0.318 | N/D | 1501 | — |
| Vue | 0.889 | 1.640 | 0.751 | N/D | 1501 | — |
| Angular | 1.306 | 1.571 | 0.264 | N/D | 1502 | — |
| Alpine | 4.724 | 5.321 | 0.597 | N/D | 1502 | — |
| JavaScript directo | 0.194 | 0.274 | 0.080 | N/D | 1500 | — |


### if

| Motor | Heap definiciones Δ MiB | Heap activo Δ MiB | Activación Δ MiB | Retención tras ocultar Δ MiB | Elementos activos | Elementos inertes |
|---|---|---|---|---|---|---|
| GTPL AOT | 0.077 | 0.370 | 0.293 | 0.325 | 1153 | 0 |
| GTPL JIT | 0.405 | 0.693 | 0.289 | 0.321 | 1153 | 0 |
| React | 0.427 | 0.829 | 0.402 | 0.282 | 1153 | 0 |
| Svelte | 0.198 | 0.243 | 0.046 | 0.090 | 1153 | 0 |
| Vue | 0.325 | 0.702 | 0.377 | 0.317 | 1153 | 0 |
| Angular | 0.867 | 1.401 | 0.534 | 0.562 | 1155 | 0 |
| Alpine | 0.241 | 0.678 | 0.437 | 0.170 | 1155 | 1153 |
| JavaScript directo | 0.065 | 0.078 | 0.013 | 0.040 | 1153 | 0 |


## Reproducción y datos

```sh
PLAYWRIGHT_MODULE=/ruta/playwright/index.mjs SAMPLES=5 HEAP_SAMPLES=3 \
  node scripts/benchmarks/rank.mjs
node scripts/benchmarks/rank-report.mjs
```

Confirmación de la cadencia:

```sh
PLAYWRIGHT_MODULE=/ruta/playwright/index.mjs SAMPLES=3 HEAP_SAMPLES=0 \
  GRID_START=64 GRID_LEVELS=1 GRID_SEED=45 GRID_DURATION_MS=5000 CASES=grid-64-64-100 \
  RESULTS=artifacts/general-ranking/grid-confirmation.json node scripts/benchmarks/rank.mjs
node scripts/benchmarks/rank-report.mjs artifacts/general-ranking/results.json docs/benchmarks artifacts/general-ranking/grid-confirmation.json
```

Los bundles deben corresponder al manifest; el ejecutor comprueba todos sus hashes antes de arrancar. Se alterna el orden de motores y casos. Una sola página/contexto está activa a la vez, sin compilaciones ni pruebas en paralelo. Cada resultado conserva muestras, operaciones, frames, validación, configuración, versiones, hashes y carga del sistema.

La clasificación solo describe estos adaptadores, cargas, navegador y equipo. No mide red, pintura explícita, UX completa, SSR, tamaño mínimo de una aplicación ni otras arquitecturas de estado. El ancho/alto del runner es fijo para todos. GTPL y Vue/Svelte/React/Angular/Alpine conservan sus patrones nativos; una lista indexada y una lista con claves no son algoritmos idénticos.

[Datos completos y resumen numérico](general-results.json).
