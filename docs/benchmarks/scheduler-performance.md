# Scheduler de bindings y camino síncrono

Trabajo sobre `e5fda32` en la rama `codex/optimizacion-generador-imperativo`, sin
cambiar `main`. El compilador y sus alias se mantienen: tanto la web como todos
los adaptadores GTPL siguen usando `GCodeOptimized(..., { methodAliases: true })`.

## Cambios del runtime

La cola usa el objeto de binding como clave, incluso si recibe notificaciones
desde varios contextos heredados. El estado y los watchers se actualizan en cada
asignación. La ejecución de los bindings se aplaza a una microtarea y los cambios
repetidos se recalculan contra el estado final.

`calculateBind`, las cadenas de funciones y los actualizadores de texto,
atributos, HTML, estilos, condicionales, listas y componentes devuelven valores
síncronos cuando pueden. Solo los valores que son promesas o thenables suspenden
el trabajo. Los jobs automáticos síncronos posteriores a `ready()` no crean
promesas: se comprueba también durante la ejecución del flush con `async_hooks`.
La API de `launchChange` y el montaje inicial conservan sus promesas y errores.

La identidad de cada job actúa como token de vigencia. Los trabajos todavía
pendientes se agrupan con ese mismo token; una ejecución sustituida recibe otro.
Una sola tabla débil sigue el job vigente y elimina su entrada al terminar, sin
conservar contadores por cada binding inactivo. Los resultados y rechazos de
trabajos obsoletos se descartan; un trabajo sustituido no mantiene `ready()`
pendiente de una petición antigua. Destruir o retirar un binding cancela sus jobs.
Las continuaciones de casos de switch asíncronos también comprueban su versión.

El recorrido de `BindTree` encola directamente, sin generar arrays intermedios de
argumentos. Las rutas relativas vacías del grid no se copian. Las mutaciones
anidadas de una fila no vuelven a enlazar ese mismo modelo cuando su suscripción
propia ya recibió el cambio. Se conservan el refresco explícito de datos
modificados fuera del proxy y la reasignación intencionada del mismo objeto.
Cambios de estructura combinados reconcilian la colección final.

## Auditoría del grid

El ejecutor anterior **ya medía** llamada al adaptador + Promise devuelta + espera
del DOM + lectura de layout. Por tanto, en esta versión no era correcto afirmar
que `updateMs` medía únicamente las asignaciones de GTPL y el `nextTick` de Vue.
El adaptador Vue conserva su `await nextTick()` y el de GTPL retorna después de
asignar el modelo; la espera común del ejecutor completa el intervalo en ambos.

La espera anterior solo comprobaba la primera y última celda seleccionadas. Una
regresión reproduce un adaptador que retrasa una celda intermedia: antes se daba
por completado demasiado pronto. Ahora se exige texto y atributo correctos en
**todas** las celdas modificadas antes de terminar el cronómetro. La comprobación
del modelo completo al final del nivel sigue vigente.

Se añade `dispatchMs` y `raw.dispatchTimes` como diagnóstico de la llamada
inmediata, separado de `updateMs`. `applyMs` incluye asignación, espera y
comprobación de todas las celdas hasta antes de leer geometría; `layoutMs` mide
esa lectura forzada aparte. Sus series completas también se exportan. El resultado JSON describe ambos contratos y
la interfaz etiqueta el principal como «Actualización + DOM + layout». La
comprobación de todas las celdas forma parte del intervalo para todos los motores.
Los resultados del nuevo ejecutor no deben mezclarse con ensayos antiguos que
usaban la comprobación de extremos.

El workload elige índices únicos por frame y fuerza un valor distinto del
anterior. En 128×128 y 100 % son 16.384 asignaciones y 32.768 bindings dinámicos de
valor (atributo y texto). El batching no puede fusionar bindings distintos; aquí
importan el coste síncrono por binding y los recorridos, no la eliminación de
estados intermedios de una misma celda. La plantilla además tiene el atributo de
identidad, que no se modifica en los frames.

GTPL sigue creando una instancia completa por celda y Vue una aplicación con un
componente por celda. Se conserva esa granularidad en la comparación; sustituir
GTPL por una sola instancia o saltarse bindings en el adaptador cambiaría la
arquitectura medida. Los datos de montaje y heap ayudan a decidir una posterior
reducción del coste por instancia; no se atribuyen únicamente al scheduler.

## Protocolo

Chrome headless en el mismo equipo de los ensayos de la rama. Los bundles reales
anteriores se guardan antes de modificar el runtime. Tras el cambio se reconstruye
la biblioteca y todos los benchmarks. Se alterna el orden de las revisiones y se
crea una página nueva por muestra. No se ejecutan pruebas ni compilaciones durante
las medidas de aceptación.

`scheduler.mjs` usa el compilador imperativo con alias, contadores de watchers,
cálculos de una fórmula síncrona y escrituras reales de texto. El cronómetro
incluye asignaciones y el drenaje de 80 microtareas validado para estos fixtures;
no pretende ser una API general para esperar actualizaciones arbitrarias. Se
comparan ráfagas de 1/10/1.000 cambios, regreso al valor ya renderizado, una fila de
una lista de 100 elementos y 200 actualizaciones en tareas independientes. Estas
últimas usan `MessageChannel` y excluyen el despacho de la tarea.

`grid-runtime.mjs` importa los bundles publicados de GTPL anterior, GTPL nuevo y
Vue, y ejecuta el mismo `runGrid` actualizado. Tamaños 32×32 y 128×128, densidades
10/25/100 %, una animación de un segundo tras el calentamiento de 4×4 y la medición
de la cadencia inactiva. Las muestras de montaje y heap usan otra página fresca:
GC antes/después mediante CDP, con tiempos de montaje terminados antes del GC.
El heap es memoria JavaScript; excluye el DOM nativo, no es RSS ni el tamaño de
una instancia aislada. El residual tras destroy puede contener código/metadatos.

## Reproducción

Antes de cambiar el runtime, guardar los bundles de referencia:

```sh
node scripts/benchmarks/scheduler.mjs prepare reference
node scripts/benchmarks/grid-runtime.mjs prepare reference
```

Después de aplicar el cambio:

```sh
npm test
npm run build
npm --prefix scripts/benchmarks run build
node --test scripts/benchmarks/*.test.mjs
node scripts/benchmarks/scheduler.mjs prepare candidate
node scripts/benchmarks/grid-runtime.mjs prepare candidate
node scripts/benchmarks/serve.mjs --port 4187
```

Con el servidor abierto, ejecutar secuencialmente:

```sh
PLAYWRIGHT_MODULE=/ruta/absoluta/playwright/index.mjs SAMPLES=15 \
  node scripts/benchmarks/scheduler.mjs run
PLAYWRIGHT_MODULE=/ruta/absoluta/playwright/index.mjs SAMPLES=5 \
  node scripts/benchmarks/grid-runtime.mjs run
```

`CHROME`, `BENCH_ORIGIN`, `GRID_SIZES`, `GRID_DENSITIES` y `GRID_ENGINES` permiten
seleccionar el ejecutable, servidor o subconjunto del ensayo del grid.
`GRID_DURATION_MS=5000` alarga cada animación y `GRID_RESULTS` guarda el ensayo
adicional en otro archivo para no mezclar tandas.

## Resultados

Contadores: 15 muestras por revisión, medianas. El tiempo es asignación +
resolución del fixture en ms; en las 200 tareas separadas es el promedio por
actualización de cada muestra. «Anterior → nuevo» usa el mismo compilador y alias.

| Escenario | Eventos | Cálculos | Escrituras DOM | Tiempo (ms) |
|---|---:|---:|---:|---:|
| burst1 | 1 → 1 | 1 → 1 | 1 → 1 | 0.600 → 0.500 |
| burst10 | 10 → 10 | 10 → 1 | 10 → 1 | 0.400 → 0.700 |
| burst1000 | 1000 → 1000 | 1000 → 1 | 1000 → 1 | 19.100 → 6.300 |
| unchanged | 1001 → 1001 | 1001 → 1 | 1001 → 0 | 6.000 → 5.400 |
| rowBurst1000 | 1000 → 1000 | 1000 → 1 | 1000 → 1 | 38.100 → 17.500 |
| separateTasks200 | 200 → 200 | 200 → 200 | 200 → 200 | 0.021 → 0.035 |

El objetivo determinista de 1.000 asignaciones → un cálculo y una escritura se
cumple, sin eliminar eventos de estado. Si el valor final coincide con el ya
mostrado, el nuevo runtime no escribe en el DOM. El caso de tareas independientes
no puede fusionarse: se conservan 200 eventos/cálculos/escrituras.

Grid: 5 muestras por revisión, tamaño y densidad. Las celdas cambian una vez por
frame; los tiempos son medianas de las medianas por muestra y los FPS son los
observados por rAF, sin interpolación. Todos los lotes y estados finales se validan.

| Grid | Densidad | Anterior: update / FPS | Nuevo: update / FPS | Vue: update / FPS |
|---|---:|---:|---:|---:|
| 32×32 | 10 % | 7.40 ms / 57.1 | 7.40 ms / 59.0 | 8.10 ms / 58.0 |
| 32×32 | 25 % | 14.50 ms / 40.6 | 14.65 ms / 41.0 | 16.50 ms / 35.4 |
| 32×32 | 100 % | 52.90 ms / 14.5 | 52.00 ms / 14.8 | 59.50 ms / 13.3 |
| 128×128 | 10 % | 109.50 ms / 4.0 | 110.40 ms / 4.0 | 122.75 ms / 3.7 |
| 128×128 | 25 % | 236.70 ms / 2.5 | 240.10 ms / 2.5 | 260.50 ms / 2.3 |
| 128×128 | 100 % | 821.60 ms / 0.9 | 884.20 ms / 0.9 | 960.30 ms / 0.8 |

Desglose de 128×128 al 100 % (medianas independientes, ms):

| Revisión | Asignación inmediata | Hasta DOM comprobado | Layout forzado | Frames por muestra |
|---|---:|---:|---:|---:|
| reference | 51.40 | 152.20 | 676.70 | 1 |
| candidate | 44.10 | 179.80 | 704.40 | 1 |
| vue | 51.30 | 253.70 | 709.10 | 1 |

Los valores de fases son medianas independientes y no tienen por qué sumar exactamente el tiempo completo. Las muestras con pocos frames no constituyen una cadencia estable; no se proclama un ganador de FPS a partir de una sola observación.

Confirmación de 128×128 al 100 % con animaciones de 5 segundos, tres páginas por revisión (anterior/nuevo):

| Revisión | Hasta DOM (ms) | Layout (ms) | Completo (ms) | Frames por muestra | FPS |
|---|---:|---:|---:|---:|---:|
| reference | 162.50 | 702.00 | 857.30 | 5.00 | 0.90 |
| candidate | 180.80 | 712.10 | 886.00 | 5.00 | 0.87 |

Esta comprobación sigue teniendo pocos frames: sirve para evitar concluir a partir de una única actualización, no para proclamar una cadencia estable. La reducción de promesas y de cálculos redundantes no implica una mejora de FPS en este grid.

Montaje en otra página y heap vivo JavaScript tras GC (no incluye DOM nativo):

| Grid | Revisión | Montaje (ms) | Heap vivo (bytes) | Heap después de destroy (bytes) |
|---|---|---:|---:|---:|
| 32×32 | reference | 58.80 | 2184616 | 205088 |
| 32×32 | candidate | 60.00 | 2191052 | 219580 |
| 32×32 | vue | 51.10 | 2303448 | 384976 |
| 128×128 | reference | 633.10 | 31912048 | 458736 |
| 128×128 | candidate | 688.80 | 31919840 | 473188 |
| 128×128 | vue | 511.00 | 31696188 | 1371592 |

Estos resultados describen un motor/equipo y la granularidad de los adaptadores
actuales. El batching no reduce el número necesario de bindings distintos del
grid. El montaje y el heap no se consideran resueltos por retirar `async`:
conservan el coste de los modelos, componentes, suscripciones y DOM wrappers.

## Interpretación y límites

El ahorro determinista está en las ráfagas: en el fixture de texto se mantienen
1.000 eventos, pero se calcula/escribe una vez; en la fila de la lista sucede lo
mismo. La promesa de una función asíncrona devuelta desde una fórmula normal se
sigue esperando: `<p>{{ return funcion_asincrona() }}</p>` tiene una regresión
específica en los tres modos del compilador, sin `await` en la plantilla.

No hay una mejora general de tiempo: en 200 tareas independientes el promedio por
actualización pasa de 0,021 a 0,035 ms. Para el grid128×128/100 %, la confirmación
más larga pasa de 857,3 a 886,0 ms por actualización completa; el tramo hasta DOM
comprobado también crece (162,5 → 180,8 ms). La cola sigue teniendo coste fijo,
aunque ya no cree promesas para los jobs síncronos automáticos.

La lectura forzada de layout ronda 700 ms y supone aproximadamente el 80 % del
intervalo completo de ese caso. Por tanto, no se atribuye todo el coste a los
bindings ni se presentan los cambios como una mejora de FPS del grid. Los
intervalos completos incluyen todo el trabajo de ambos motores y la misma espera
de DOM; el retorno inmediato de GTPL no acorta artificialmente su cronómetro.

El heap vivo del grid grande queda prácticamente igual (~31,9 MB), pero el
montaje medido empeora (633,1 → 688,8 ms). Reducir el coste de una instancia GTpl
por celda y estudiar el estilo/layout son tareas distintas que siguen siendo
relevantes; los contadores de promesas no demuestran que estén resueltas. No se
cambia la granularidad del adaptador para mejorar artificialmente la comparación.

La variante final utiliza identidad de job en una sola tabla débil y retira la
entrada al quedar inactiva. Esto evita conservar versiones por cada binding vivo;
la prueba de peticiones antiguas tras períodos inactivos cubre el caso ABA.

Bundles, hashes, muestras y series completas: [scheduler-results.json](scheduler-results.json).

## Validación

- `npm test`: 65 pruebas.
- `node --test scripts/benchmarks/*.test.mjs`: 63 pruebas.
- TypeScript y build ESM/CJS/global/declaraciones/comprobación del paquete correctos.
- Reconstrucción completa de los benchmarks con la variante optimizada y alias.
- 11 demostraciones del índice y 22 adaptadores GTPL publicados pasan en Chrome.
- Regresiones de batching, watchers, herencia, reentrancia, paths, promesas perezosas, thenables, errores, async obsoleto, listas, refresh crudo, destrucción y casos de switch suspendidos.
- La regresión de celda intermedia diferida falla con la espera anterior del grid y pasa con la espera de todas las celdas.

El índice llama ahora a `ready()` tras montar cada demostración para delimitar también su trabajo inicial.
