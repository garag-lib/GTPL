# GTPL frente a los demás: medición general

Tanda: 2026-11-04T14:00:12.786Z → 2026-11-04T14:16:28.987Z. Revisión medida: `81efcb65abce80ca25078d37a6e5f01427d8e32c`.
Chrome 156.0.8078.79, Intel(R) Core(TM) i5-2400S CPU @ 2.50GHz, 4 cores; viewport 960×190, DPR 1. 560 muestras válidas, 0 fallos.
Confirmación independiente del grid: 54 muestras válidas, 0 fallos. Total: 614.

## Puesto de latencia

Índice descriptivo de estos seis casos DOM, no una clasificación universal de bibliotecas. JavaScript directo = 1; menor es mejor. Cada caso pesa 1/6. Dentro de cada caso, montaje y operaciones pesan 1/2 cada uno; las operaciones de lista y condicional se reparten su mitad por igual. Se usa la media geométrica de cocientes entre medianas. Descarga/importación no se cronometran; la compilación JIT durante mount sí. Memoria, FPS y switch no se mezclan en este índice.

| Puesto entre 8 modos | Motor/modo | Índice latencia | Montaje | Operaciones | IC bootstrap 95% |
|---|---|---|---|---|---|
| 1 | JavaScript directo | 1.00 | 1.00 | 1.00 | 1.00–1.00 |
| 2 | React | 1.86 | 3.10 | 1.12 | 1.83–1.95 |
| 3 | Vue | 1.98 | 3.15 | 1.24 | 1.93–2.07 |
| 4 | Svelte | 2.18 | 4.03 | 1.18 | 2.13–2.30 |
| 5 | Angular | 2.21 | 4.76 | 1.02 | 2.16–2.38 |
| 6 | GTPL AOT | 2.35 | 4.44 | 1.25 | 2.30–2.53 |
| 7 | GTPL JIT | 2.82 | 6.49 | 1.23 | 2.75–3.01 |
| 8 | Alpine | 4.89 | 9.35 | 2.56 | 4.77–5.19 |

Entre los seis frameworks en su modo de producción, excluyendo JavaScript directo y la variante GTPL JIT, GTPL AOT queda **5.º de 6**.

Los intervalos son exploratorios (2.000 remuestreos emparejados por ronda, n=5); intervalos superpuestos y diferencias pequeñas no justifican un ganador estadístico. No se eliminan muestras lentas. Todas deben pasar validación completa de salida y limpieza.

## Por caso

Posiciones por índice combinado del caso; operaciones = media geométrica de las operaciones declaradas, normalizadas frente a JavaScript directo. Valores relativos, no milisegundos.

| Caso | GTPL AOT: puesto/8 | GTPL JIT: puesto/8 | Mejor framework de producción | GTPL AOT montaje | GTPL AOT operaciones |
|---|---|---|---|---|---|
| Lista de 500 filas | 6 | 7 | Vue | 1.81 | 1.01 |
| Condicional, 128 bloques | 3 | 8 | Svelte | 33.65 | 1.20 |
| Estilos, 500 elementos | 6 | 7 | React | 4.18 | 1.42 |
| Clases, 500 elementos | 5 | 6 | Vue | 3.45 | 1.18 |
| Atributos/texto, 500 elementos | 6 | 5 | React | 3.66 | 1.50 |
| Formulario, 500 campos | 6 | 7 | Vue | 2.38 | 1.23 |


### Medianas absolutas de operaciones (ms)

| Caso / operación | GTPL AOT | GTPL JIT | React | Svelte | Vue | Angular | Alpine | JavaScript directo |
|---|---|---|---|---|---|---|---|---|
| for-500 / mountMs | 70.320 | 76.865 | 47.210 | 63.490 | 44.510 | 58.075 | 161.610 | 38.850 |
| for-500 / updateMs | 21.945 | 21.215 | 13.040 | 17.075 | 15.060 | 11.280 | 43.235 | 20.890 |
| for-500 / appendMs | 20.015 | 20.110 | 8.740 | 18.060 | 8.720 | 6.760 | 61.645 | 28.545 |
| for-500 / removeMs | 15.645 | 15.315 | 7.055 | 7.505 | 8.335 | 5.835 | 24.955 | 9.935 |
| for-500 / reverseMs | 20.535 | 23.055 | 21.275 | 38.820 | 20.885 | 20.540 | 42.475 | 18.185 |
| for-500 / replaceMs | 22.820 | 22.650 | 22.830 | 28.165 | 21.725 | 23.995 | 92.625 | 27.875 |
| if / mountMs | 8.075 | 52.105 | 9.685 | 4.865 | 8.565 | 15.995 | 7.800 | 0.240 |
| if / showMs | 49.050 | 46.280 | 47.185 | 36.970 | 44.650 | 50.470 | 53.780 | 32.390 |
| if / hideMs | 1.880 | 1.740 | 5.375 | 2.075 | 1.895 | 2.215 | 5.000 | 1.520 |
| if / revisitMs | 26.470 | 26.075 | 37.180 | 26.640 | 31.785 | 29.560 | 39.435 | 28.600 |
| styles / mountMs | 46.895 | 52.645 | 26.445 | 39.290 | 33.595 | 46.325 | 104.435 | 11.220 |
| styles / updateMs | 13.252 | 13.250 | 10.175 | 11.348 | 17.377 | 10.642 | 37.393 | 9.353 |
| classes / mountMs | 34.305 | 36.885 | 22.510 | 33.905 | 20.670 | 43.835 | 91.045 | 9.955 |
| classes / updateMs | 10.455 | 10.555 | 9.840 | 9.870 | 10.520 | 11.320 | 19.477 | 8.890 |
| attributes / mountMs | 54.825 | 55.025 | 26.560 | 62.635 | 31.050 | 41.465 | 178.890 | 14.965 |
| attributes / updateMs | 16.595 | 15.807 | 11.370 | 18.008 | 16.912 | 10.765 | 41.607 | 11.063 |
| forms / mountMs | 53.735 | 61.240 | 43.180 | 58.815 | 41.985 | 52.490 | 109.685 | 22.570 |
| forms / inputMs | 15.293 | 14.978 | 15.355 | 13.610 | 15.420 | 12.663 | 21.925 | 12.385 |


## Grid: pruebas de estrés separadas

Misma granularidad que los adaptadores publicados. Cada muestra empieza con calentamiento de 4×4, usa semilla base 42 más el nivel (42 a 45) y mide todas las celdas modificadas, más layout. Animación solicitada de 1,5 s por nivel; una operación larga puede excederla. Los FPS están limitados por rAF/pantalla. Menos de 12 frames en una muestra implica una cadencia insuficientemente estable; la cifra sigue registrada, no se convierte en un ganador de FPS.

| Grid / % | GTPL AOT update (ms) | Puesto GTPL AOT /8 | Mejor update | GTPL AOT FPS | Mín. frames GTPL AOT |
|---|---|---|---|---|---|
| 16x16-100 | 12.465 | 6 | React | 57.36 | 72 |
| 32x32-100 | 44.530 | 4 | React | 15.96 | 22 |
| 48x48-100 | 110.840 | 5 | JavaScript directo | 6.88 | 11 |
| 64x64-100 | 192.125 | 4 | Angular | 3.93 | 6 |
| 64x64-10 | 27.945 | 5 | JavaScript directo | 15.65 | 23 |


### 16x16-100

| Motor | Update ms [mín–máx] | FPS [mín–máx] | Frames mínimos |
|---|---|---|---|
| GTPL AOT | 12.465 [11.780–15.120] | 57.365 [46.958–58.024] | 72 |
| GTPL JIT | 12.240 [11.800–12.737] | 57.365 [56.046–58.684] | 85 |
| React | 11.595 [11.402–14.613] | 58.024 [48.793–58.684] | 74 |
| Svelte | 11.900 [11.650–15.565] | 58.684 [44.837–58.684] | 68 |
| Vue | 14.200 [13.970–16.225] | 52.749 [45.002–53.409] | 69 |
| Angular | 11.795 [11.170–14.190] | 58.024 [48.134–58.684] | 73 |
| Alpine | 20.123 [19.630–23.465] | 39.562 [34.946–40.881] | 53 |
| JavaScript directo | 11.690 [11.050–12.600] | 58.684 [56.705–59.343] | 86 |


### 32x32-100

| Motor | Update ms [mín–máx] | FPS [mín–máx] | Frames mínimos |
|---|---|---|---|
| GTPL AOT | 44.530 [44.110–50.962] | 15.958 [14.348–16.130] | 22 |
| GTPL JIT | 44.115 [42.885–45.200] | 15.825 [15.653–16.130] | 24 |
| React | 42.973 [41.500–55.598] | 16.596 [12.766–17.144] | 20 |
| Svelte | 44.600 [43.410–51.670] | 15.958 [13.696–16.484] | 21 |
| Vue | 50.722 [49.910–55.530] | 14.506 [13.696–14.681] | 21 |
| Angular | 44.785 [42.980–49.210] | 15.958 [14.043–16.305] | 22 |
| Alpine | 73.310 [71.945–84.435] | 10.737 [9.575–10.851] | 15 |
| JavaScript directo | 43.730 [43.133–48.305] | 15.825 [14.681–15.958] | 23 |


### 48x48-100

| Motor | Update ms [mín–máx] | FPS [mín–máx] | Frames mínimos |
|---|---|---|---|
| GTPL AOT | 110.840 [106.310–111.995] | 6.875 [6.667–6.948] | 11 |
| GTPL JIT | 111.800 [99.825–118.527] | 6.948 [6.186–7.097] | 10 |
| React | 107.840 [95.085–123.072] | 7.022 [6.061–7.253] | 10 |
| Svelte | 103.845 [101.200–123.220] | 7.097 [5.934–7.253] | 9 |
| Vue | 123.217 [119.590–129.930] | 6.250 [5.934–6.383] | 9 |
| Angular | 105.145 [99.330–126.205] | 6.875 [6.061–7.253] | 10 |
| Alpine | 182.248 [179.310–184.570] | 4.616 [4.528–4.753] | 7 |
| JavaScript directo | 100.065 [97.960–121.525] | 6.804 [5.934–7.022] | 9 |


### 64x64-100

| Motor | Update ms [mín–máx] | FPS [mín–máx] | Frames mínimos |
|---|---|---|---|
| GTPL AOT | 192.125 [183.950–204.565] | 3.925 [3.600–3.956] | 6 |
| GTPL JIT | 192.633 [188.317–221.497] | 3.790 [3.429–4.000] | 6 |
| React | 194.560 [176.690–212.937] | 3.925 [3.495–4.118] | 6 |
| Svelte | 190.525 [173.775–229.353] | 3.925 [3.333–4.078] | 6 |
| Vue | 228.550 [204.787–234.420] | 3.429 [3.093–3.565] | 5 |
| Angular | 188.815 [172.475–214.495] | 4.000 [3.333–4.159] | 6 |
| Alpine | 314.585 [301.470–320.040] | 2.581 [2.553–2.679] | 4 |
| JavaScript directo | 190.375 [184.195–220.373] | 3.790 [3.303–3.913] | 6 |


### 64x64-10

| Motor | Update ms [mín–máx] | FPS [mín–máx] | Frames mínimos |
|---|---|---|---|
| GTPL AOT | 27.945 [27.468–28.940] | 15.653 [15.001–15.825] | 23 |
| GTPL JIT | 28.195 [27.898–29.205] | 15.484 [14.839–15.485] | 23 |
| React | 27.528 [27.400–30.370] | 15.484 [14.194–15.484] | 22 |
| Svelte | 27.875 [27.745–30.050] | 15.320 [13.549–15.485] | 21 |
| Vue | 30.215 [30.070–32.500] | 14.681 [13.549–14.681] | 21 |
| Angular | 27.755 [26.405–29.688] | 15.320 [14.043–16.130] | 22 |
| Alpine | 39.755 [38.960–44.650] | 13.264 [11.209–13.405] | 17 |
| JavaScript directo | 26.880 [26.695–27.285] | 15.485 [14.681–15.825] | 23 |


### Confirmación más larga del grid de 64×64 al 100 % y al 10 %

La tanda inicial produjo menos de 12 frames por muestra en este estrés. Se repite en una tanda separada de cinco segundos, tres páginas nuevas por motor, con los mismos bundles y validaciones. Se usa semilla 45 para el 100 %, igual a la semilla base 42 + nivel 3 del barrido inicial; para el 10 % se conserva la semilla 42. Las dos tablas siguientes mantienen los ocho modos DOM en el orden 100 % y 10 %. No se mezclan estas observaciones con las de 1,5 segundos ni con el índice de latencia. Los contadores indican si siguen existiendo pocas observaciones.

| Motor | Update ms [mín–máx] | FPS [mín–máx] | Frames mínimos |
|---|---|---|---|
| GTPL AOT | 198.500 [181.143–205.280] | 3.775 [3.738–3.961] | 19 |
| GTPL JIT | 196.450 [177.935–203.720] | 3.763 [3.763–4.091] | 19 |
| React | 176.560 [163.043–190.162] | 3.948 [3.909–4.217] | 20 |
| Svelte | 185.660 [182.055–200.580] | 3.859 [3.775–4.078] | 19 |
| Vue | 197.615 [195.465–212.300] | 3.619 [3.462–3.666] | 18 |
| Angular | 160.800 [160.057–175.268] | 4.258 [3.948–4.258] | 20 |
| Alpine | 312.197 [308.727–330.075] | 2.692 [2.533–2.727] | 13 |
| JavaScript directo | 201.070 [186.925–208.570] | 3.775 [3.631–4.026] | 19 |


| Motor | Update ms [mín–máx] | FPS [mín–máx] | Frames mínimos |
|---|---|---|---|
| GTPL AOT | 27.172 [25.647–27.482] | 15.549 [15.446–15.842] | 78 |
| GTPL JIT | 26.998 [25.435–27.055] | 15.549 [15.497–16.382] | 78 |
| React | 26.193 [24.837–27.085] | 15.395 [15.248–16.238] | 77 |
| Svelte | 26.485 [25.250–27.380] | 15.549 [15.446–16.382] | 78 |
| Vue | 29.620 [28.435–30.365] | 14.654 [14.606–15.299] | 74 |
| Angular | 27.180 [26.018–27.260] | 15.349 [15.349–16.185] | 77 |
| Alpine | 39.618 [37.245–39.790] | 12.872 [12.716–13.664] | 64 |
| JavaScript directo | 24.393 [22.935–25.260] | 15.446 [15.248–16.436] | 77 |


## Heap JavaScript y DOM, separados de los tiempos

Tres muestras por motor/caso, en páginas nuevas. La llamada a readMemory se sustituye únicamente en un módulo virtual del servidor por HeapProfiler.collectGarbage + Runtime.getHeapUsage de CDP. No se modifica ningún archivo del runner publicado ni los adaptadores. Se usa exclusivamente el contador usedSize: no se agregan los otros contadores CDP, que también quedan registrados. El dato es heap V8, excluye memoria DOM nativa, GPU y RSS; NO es measureUserAgentSpecificMemory ni RAM total, y no se interpreta como la residencia completa del código o las plantillas. Los tiempos de esta tanda no entran en el índice. Se registra el hash del módulo original y del instrumento. Se informa de cómo cambia usedSize tras importar las definiciones y montar la vista. Los nodos inertes se cuentan aparte.

### switch-8

| Motor | Heap definiciones Δ MiB | Heap activo Δ MiB | Activación Δ MiB | Retención tras ocultar Δ MiB | Elementos activos | Elementos inertes |
|---|---|---|---|---|---|---|
| GTPL AOT | 0.085 | 0.416 | 0.331 | N/D | 1154 | 0 |
| GTPL JIT | 1.541 | 1.868 | 0.327 | N/D | 1154 | 0 |
| React | 0.915 | 1.317 | 0.402 | N/D | 1154 | 0 |
| Svelte | 0.512 | 0.553 | 0.041 | N/D | 1154 | 0 |
| Vue | 1.246 | 1.616 | 0.370 | N/D | 1154 | 0 |
| Angular | 1.030 | 1.549 | 0.519 | N/D | 1155 | 0 |
| Alpine | 0.323 | 0.989 | 0.666 | N/D | 1162 | 9224 |
| JavaScript directo | 0.379 | 0.392 | 0.013 | N/D | 1153 | 0 |


### switch-32

| Motor | Heap definiciones Δ MiB | Heap activo Δ MiB | Activación Δ MiB | Retención tras ocultar Δ MiB | Elementos activos | Elementos inertes |
|---|---|---|---|---|---|---|
| GTPL AOT | 0.094 | 0.432 | 0.339 | N/D | 1154 | 0 |
| GTPL JIT | 5.443 | 5.780 | 0.336 | N/D | 1154 | 0 |
| React | 2.644 | 3.045 | 0.401 | N/D | 1154 | 0 |
| Svelte | 1.589 | 1.620 | 0.031 | N/D | 1154 | 0 |
| Vue | 4.842 | 5.207 | 0.365 | N/D | 1154 | 0 |
| Angular | 1.511 | 2.037 | 0.526 | N/D | 1155 | 0 |
| Alpine | 0.603 | 1.626 | 1.024 | N/D | 1186 | 36896 |
| JavaScript directo | 1.460 | 1.472 | 0.013 | N/D | 1153 | 0 |


### switch-64

| Motor | Heap definiciones Δ MiB | Heap activo Δ MiB | Activación Δ MiB | Retención tras ocultar Δ MiB | Elementos activos | Elementos inertes |
|---|---|---|---|---|---|---|
| GTPL AOT | 0.105 | 0.459 | 0.354 | N/D | 1154 | 0 |
| GTPL JIT | 10.648 | 10.999 | 0.351 | N/D | 1154 | 0 |
| React | 5.195 | 5.596 | 0.401 | N/D | 1154 | 0 |
| Svelte | 3.013 | 3.044 | 0.031 | N/D | 1154 | 0 |
| Vue | 9.732 | 10.097 | 0.365 | N/D | 1154 | 0 |
| Angular | 2.146 | 2.672 | 0.526 | N/D | 1155 | 0 |
| Alpine | 1.695 | 2.394 | 0.699 | N/D | 1218 | 73792 |
| JavaScript directo | 2.901 | 2.914 | 0.013 | N/D | 1153 | 0 |


### for-500

| Motor | Heap definiciones Δ MiB | Heap activo Δ MiB | Activación Δ MiB | Retención tras ocultar Δ MiB | Elementos activos | Elementos inertes |
|---|---|---|---|---|---|---|
| GTPL AOT | 1.873 | 2.228 | 0.355 | N/D | 1501 | — |
| GTPL JIT | 1.950 | 2.307 | 0.356 | N/D | 1501 | — |
| React | 0.975 | 1.587 | 0.612 | N/D | 1501 | — |
| Svelte | 1.316 | 1.637 | 0.321 | N/D | 1501 | — |
| Vue | 0.888 | 1.640 | 0.752 | N/D | 1501 | — |
| Angular | 1.304 | 1.571 | 0.271 | N/D | 1502 | — |
| Alpine | 4.723 | 5.446 | 0.723 | N/D | 1502 | — |
| JavaScript directo | 0.194 | 0.274 | 0.080 | N/D | 1500 | — |


### if

| Motor | Heap definiciones Δ MiB | Heap activo Δ MiB | Activación Δ MiB | Retención tras ocultar Δ MiB | Elementos activos | Elementos inertes |
|---|---|---|---|---|---|---|
| GTPL AOT | 0.081 | 0.387 | 0.306 | 0.338 | 1153 | 0 |
| GTPL JIT | 0.405 | 0.706 | 0.301 | 0.334 | 1153 | 0 |
| React | 0.427 | 0.828 | 0.401 | 0.281 | 1153 | 0 |
| Svelte | 0.198 | 0.243 | 0.046 | 0.090 | 1153 | 0 |
| Vue | 0.325 | 0.703 | 0.378 | 0.316 | 1153 | 0 |
| Angular | 0.867 | 1.404 | 0.537 | 0.564 | 1155 | 0 |
| Alpine | 0.241 | 0.678 | 0.437 | 0.171 | 1155 | 1153 |
| JavaScript directo | 0.065 | 0.078 | 0.013 | 0.040 | 1153 | 0 |


## Reproducción y datos

```sh
PLAYWRIGHT_MODULE=/ruta/playwright/index.mjs SAMPLES=5 HEAP_SAMPLES=3 \
  node scripts/benchmarks/rank.mjs
node scripts/benchmarks/rank-report.mjs
```

Confirmación de la cadencia:

```sh
PLAYWRIGHT_MODULE=/ruta/playwright/index.mjs ENGINES=gtpl,gtpl-jit,react,svelte,vue,angular,alpine,vanilla,flutter SAMPLES=3 HEAP_SAMPLES=0 \
  GRID_START=64 GRID_LEVELS=1 GRID_SEED=45 GRID_DURATION_MS=5000 CASES=grid-64-64-100,grid-64-10 \
  RESULTS=artifacts/general-ranking/grid-confirmation.json node scripts/benchmarks/rank.mjs
node scripts/benchmarks/rank-report.mjs artifacts/general-ranking/results.json docs/benchmarks artifacts/general-ranking/grid-confirmation.json
```

Los bundles deben corresponder al manifest; el ejecutor comprueba todos sus hashes antes de arrancar. Se alterna el orden de motores y casos. Una sola página/contexto está activa a la vez, sin compilaciones ni pruebas en paralelo. Cada resultado conserva muestras, operaciones, frames, validación, configuración, versiones, hashes y carga del sistema.

La clasificación solo describe estos adaptadores, cargas, navegador y equipo. No mide red, pintura explícita, UX completa, SSR, tamaño mínimo de una aplicación ni otras arquitecturas de estado. El ancho/alto del runner es fijo para todos. GTPL y Vue/Svelte/React/Angular/Alpine conservan sus patrones nativos; una lista indexada y una lista con claves no son algoritmos idénticos.

[Datos completos y resumen numérico](general-results.json).

## Flutter en el grid adicional

Flutter 3.47.8 / Dart 3.13.7, CanvasKit release. Su actualización incluye `endOfFrame` y planificación de frames; DOM mide aplicación y layout. No se incorpora Flutter al índice de latencia DOM. Chrome headless en este equipo no representa todos los dispositivos ni GPU.

| Motor | 100 %: ms / FPS | 10 %: ms / FPS | Frames mínimos 100 % / 10 % |
|---|---:|---:|---:|
| gtpl | 198.50 / 3.77 | 27.17 / 15.55 | 19 / 78 |
| gtpl-jit | 196.45 / 3.76 | 27.00 / 15.55 | 19 / 78 |
| react | 176.56 / 3.95 | 26.19 / 15.40 | 20 / 77 |
| svelte | 185.66 / 3.86 | 26.48 / 15.55 | 19 / 78 |
| vue | 197.62 / 3.62 | 29.62 / 14.65 | 18 / 74 |
| angular | 160.80 / 4.26 | 27.18 / 15.35 | 20 / 77 |
| alpine | 312.20 / 2.69 | 39.62 / 12.87 | 13 / 64 |
| vanilla | 201.07 / 3.77 | 24.39 / 15.45 | 19 / 77 |
| flutter | 954.11 / 1.02 | 288.14 / 3.34 | 5 / 17 |

Flutter solo produce cinco frames por muestra al 100 %: insuficientes para presentar una clasificación estable de FPS. La primera tentativa de Flutter falló porque el servidor no enviaba `application/wasm`; se corrigió únicamente el MIME del servidor y se repitió la tanda completa, con 54 resultados válidos y cero fallos. Esa tentativa no forma parte de las puntuaciones.

## Diagnóstico de listas y atributos

[Análisis de los puntos 1 y 3 y experimentos aislados](update-analysis.md). Las variantes experimentales no están aplicadas al runtime ni forman parte de la clasificación anterior.
