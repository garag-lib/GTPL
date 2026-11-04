# Correcciones y mejoras de GTPL, sin g-key

4 de noviembre de 2026. Trabajo realizado en `codex/gtpl-correcciones-mejoras`,
a partir de `main` en `4b8f5aa` (código de GTPL 3.0.0 en `cc93a6c`).
No se ha recuperado la rama experimental descartada.

## Cambios realizados

| Punto del registro | Resultado |
|---|---|
| 1. Bindings en varios ancestros | Metadata débil adicional solo cuando un binding necesita más de un contexto heredado. Destrucción limpia todos los ancestros; `BindMap` conserva su tipo público. |
| 2. Ready de hijos tardíos | Se sigue el primer trabajo del binding aunque la raíz ya esté lista. Rechazos, cancelaciones y sustituciones conservan su significado; el padre no vuelve a estar pendiente. |
| 3. Listas transformadas | Filtros, fórmulas y pipes reconciliados por su resultado completo, sin interpretar índices del array de origen como índices de salida. |
| 4. Construcción fallida | `loadOptions` destruye la instancia parcial antes de propagar el error original. La directiva que falla retira su elemento si ya lo conectó. Se limpian listeners, hijos, watchers y bindings registrados. |
| 5. Listas directas | Se agrupan notificaciones y se comprueba el estado final. Las propiedades de filas ordinarias ya notificadas por sus proxies no provocan copias ni reasignaciones de toda la lista. Las asignaciones explícitas de índices fuerzan el refresco de esas filas. |
| 6. Lecturas de proxies | Cada suscripción reutiliza su nodo del índice. Una lectura repetida evita reconstruir rutas y buscar de nuevo suscripciones existentes. Se conservan snapshots de notificación, símbolos, aliases, ciclos y propietarios primitivos. |
| 7. Entrada AOT | Nuevo `@mpeliz/gtpl/runtime`, con objeto exportado por defecto, ESM/CJS y tipos compartidos. La entrada completa conserva JIT; el global sigue siendo autónomo. |
| 8. Listas con claves | **Descartado por petición del usuario. No se incorpora `g-key`.** |

Los getters conservan reconciliación completa. La clasificación de filas se
calcula al montar/refrescar y se invalida al introducir filas o valores con
accessors mediante notificaciones. Como en el contrato de datos crudos, los
cambios que eluden el proxy —incluido `Object.defineProperty` sobre datos
crudos— requieren `refresh()` o una asignación explícita. No se ejecutan getters
solo para clasificar sus descriptores.

La entrada runtime comparte clases, proxies y registro de directivas con la
entrada principal dentro de cada formato. No contiene `DOMParser`, `GCompile`
ni invocaciones a `Function` para compilar código. Hay que distribuir los chunks
transitivos de `dist/shared/`, también al copiar archivos manualmente. Los
medidores de distribución se han actualizado para contarlos.

## Oportunidades adicionales

| Propuesta | Implementación y límite |
|---|---|
| Desuscribir proxies en una pasada | Partición de suscripciones y limpieza del índice sin `removed.includes` ni una búsqueda de supervivientes por cada elemento eliminado. El caso habitual de un propietario no crea un Set de propietarios. |
| Atributos con menos asignaciones | `indexOf`/`slice` para los argumentos; no se divide cada atributo ordinario. La lista de directivas pendientes se crea solo si hace falta. Registro tardío y orden conservados. |
| Switch síncrono | Continúa de forma síncrona hasta encontrar una promesa. Mantiene comparación `==`, primer caso coincidente y cancelación de selecciones obsoletas. |
| Menos trabajo inicial | Contadores de trabajo por contexto y una barrera creada al pedir `ready()`. Las actualizaciones iniciales síncronas no crean una promesa por binding. |
| Refresco heredado | Usa la cola interna automática. `launchChange` mantiene su API pública de promesa y errores. |
| Menos recorridos de ancestros | Un trabajo pendiente recuerda el último contexto comprobado. No hay una caché global de parentesco que quede obsoleta entre trabajos. |
| Prefijos de watchers | Construye cada prefijo una sola vez y lo reutiliza para los comodines. Conserva el orden, claves con puntos y altas/bajas durante callbacks. |
| Estructuras internas bajo demanda | Mapas de valores/marcas y conjunto de render diferido creados al necesitarlos. Se elimina el Set inicial de promesas por instancia. Los sets y mapas públicos conservan su forma y acceso. |
| Reutilización de generadores JIT | Ejemplo y contrato de compilación única en el README. No se añade una caché transparente por HTML: `g-tpl` puede leer el documento activo. |

## Validación

- 155 pruebas del núcleo, incluidas nuevas regresiones de herencia, montaje tardío,
  construcción fallida, getters, asignaciones crudas y observación de promesas.
- 131 pruebas del laboratorio, compiladores y herramientas; cubren legacy,
  imperative e imperative con aliases, formularios, clases, estilos, atributos,
  condicionales, listas y ciclo de vida.
- 32 pruebas adicionales con generadores compilados desde la referencia anterior.
- 51 pruebas de GTPLWeb en copia aislada y 52 seleccionadas de Sanmateo.
- Pruebas propias de Sanmateo de listas 191 → 12, reemplazo antes de ready,
  iteración, cancelación de respuestas tardías y selects dinámicos de seis vistas.
- TypeScript, build completo, paquete ESM/CJS, identidad de exports, compatibilidad
  nominal de tipos y carga del runtime con compilación dinámica prohibida.

Son 421 pruebas contadas por sus runners, más las comprobaciones de paquete y
los scripts directos de Sanmateo. GTPLWeb y Sanmateo usan el paquete candidato
mediante enlaces en copias aisladas. No han necesitado cambios de código.

Las regresiones comprueban cero promesas nuevas durante actualizaciones
síncronas posteriores, durante un switch síncrono/refresco heredado y al
registrar/ejecutar 100 bindings iniciales antes de pedir ready. El benchmark de
listas registra por separado cálculos y notificaciones: agrupar DOM no elimina
eventos públicos de watchers.

## Método de medición

Se han usado los runners del proyecto y dos extensiones del laboratorio:
`runtime-improvements.mjs` y `runtime-memory.mjs`. La referencia se reconstruyó
en un worktree aislado con las mismas dependencias. Cada preparación conserva
hashes de fuentes, bundle y chunks. Todas las mediciones se ejecutan
secuencialmente, sin builds ni tests concurrentes.

La comparación de listas usa nueve pares por tamaño, orden alterno y página
nueva por variante. Compilación y creación de datos quedan fuera del reloj.
Se confirma todo el DOM y su orden, sin forzar layout/pintura. La destrucción
se mide después de añadir 1.000 filas y retirar 100: quedan 1.900/10.900 filas.
Las desuscripciones promedian 20 retiradas por muestra, con tres calentamientos,
para limitar el efecto de la resolución del reloj en operaciones pequeñas.

La memoria se mide aparte con CDP y GC explícito: tres pares por tamaño y
configuración de watchers. Es heap JavaScript, no RAM total ni memoria nativa
DOM. Los residuos incluyen código/metadatos y no se interpretan solos como fugas.
AOT usa siete pares por fixture y scheduler nueve pares; sus relojes y cargas
son distintos de los de listas.

## Resultados medidos

Entorno: Chrome 156.0.8078.79, Node v24.22.1, Linux x86_64,
Intel(R) Core(TM) i5-2400S CPU @ 2.50GHz.

Hash de fuentes de la referencia: `c84636f3d735187df459efa066cd74fdd8ec58087cc2ffa4a9ff37e975c6d9c7`.
Hash de fuentes del candidato: `1b89726dd7eff513eff2eaa38db45e9b02247ebcf244adfa822d844d87c8ecd1`.
Se comprobó que el segundo coincide con los archivos entregados.

### Listas (medianas, milisegundos)

| Filas iniciales | Operación | Referencia | Candidato | Cambio |
|---:|---|---:|---:|---:|
| 1,000 | Montar | 65.1 | 62.2 | -4.5 % |
| 1,000 | Actualizar una fila | 1.3 | 1 | -23.1 % |
| 1,000 | Actualizar el 10 % de filas | 24.5 | 3.9 | -84.1 % |
| 1,000 | Añadir 1.000 filas | 59.3 | 51.8 | -12.6 % |
| 1,000 | Retirar 100 del principio | 74.8 | 69.1 | -7.6 % |
| 1,000 | Destruir el resultado | 30.4 | 30 | -1.3 % |
| 10,000 | Montar | 294.1 | 267.9 | -8.9 % |
| 10,000 | Actualizar una fila | 2.6 | 0.3 | -88.5 % |
| 10,000 | Actualizar el 10 % de filas | 147 | 28.5 | -80.6 % |
| 10,000 | Añadir 1.000 filas | 137.8 | 38.2 | -72.3 % |
| 10,000 | Retirar 100 del principio | 237.4 | 249.3 | +5.0 % |
| 10,000 | Destruir el resultado | 128.2 | 137.2 | +7.0 % |

Al cambiar 100 de 1.000 filas, las fórmulas de fila pasan de 1.000 ejecuciones
a 100, manteniendo 100 notificaciones de watcher. Con 1.000 cambios entre
10.000 filas, pasan de 10.000 a 1.000, manteniendo 1.000 notificaciones.
Una sola fila produce una fórmula y un evento en ambas versiones.

### Proxies y montajes estáticos (milisegundos)

| Caso | Referencia | Candidato | Cambio |
|---|---:|---:|---:|
| 50.000 lecturas anidadas | 45.2 | 28 | -38.1 % |
| Retirar 10 aliases | 0 | 0.01 | bajo resolución |
| Retirar 100 aliases | 0.035 | 0.06 | +71.4 % |
| Retirar 1.000 aliases | 0.44 | 0.4 | -9.1 % |
| 1.000 instancias estáticas | 15.2 | 15.1 | -0.7 % |

El algoritmo de retirada evita el crecimiento cuadrático, pero no mejora todos
los tamaños: el coste fijo es visible en las colecciones pequeñas. No se
interpreta una diferencia bajo la resolución del reloj como una aceleración.

### Heap activo y retención

| Instancias | Watchers | Referencia (bytes) | Candidato (bytes) | Cambio |
|---:|---|---:|---:|---:|
| 1,000 | No | 1,760,572 | 1,579,056 | -10.3 % |
| 1,000 | Sí | 1,930,832 | 1,749,064 | -9.4 % |
| 10,000 | No | 15,749,768 | 13,910,124 | -11.7 % |
| 10,000 | Sí | 17,394,512 | 15,556,672 | -10.6 % |

Las diez instancias observadas con `WeakRef` se recogen tras destruir en todas
las muestras de montajes. En el caso específico de tres niveles de herencia,
la referencia deja **10 bindings residuales y 10 hijos retenidos**; el candidato
queda en **0 bindings y 0 hijos retenidos**, manteniendo vivos los ancestros.

### AOT y scheduler

Los siguientes valores son medianas en ms. La celda muestra referencia →
candidato. Son controles de cargas diferentes; no se suman con la tabla de listas.

| Fixture AOT | Primer montaje | Activación | Actualización fría | Actualización estabilizada |
|---|---:|---:|---:|---:|
| plain | 3.5 → 3.8 | 0.1 → 0.1 | 0.11 → 0.145 | 0.054 → 0.039 |
| switch8 | 29.6 → 30 | 7.8 → 8.5 | 0.65 → 0.745 | 0.257 → 0.272 |
| list | 23.8 → 22 | 0 → 0.2 | 1.025 → 1.085 | 0.377 → 0.448 |
| nested | 29 → 29.1 | 9.3 → 8.7 | 0.675 → 0.805 | 0.278 → 0.304 |

| Scheduler | Referencia | Candidato | Cambio |
|---|---:|---:|---:|
| burst1 | 0.5 | 0.6 | +20.0 % |
| burst10 | 0.3 | 0.6 | +100.0 % |
| burst1000 | 4.8 | 8.2 | +70.8 % |
| unchanged | 6.5 | 4.3 | -33.8 % |
| rowBurst1000 | 18.4 | 16.5 | -10.3 % |
| separateTasks200 | 0.042 | 0.04 | -4.8 % |

### Tamaño de las entradas

Un bundle esbuild minificado ES2020 con los mismos exports `GTpl`, `GGenerator`
y `GregisterDirective` ocupa **18,249 bytes gzip** desde la entrada completa y
**12,588 bytes gzip** desde runtime: **31.0 % menos** en esta
configuración. No es el tamaño universal de una aplicación ni del tarball.

La suma gzip de los archivos ESM transitivos, comprimidos individualmente, es
17,948 bytes para la entrada completa y
12,205 para runtime. Esta medida incluye
las fachadas y los chunks compartidos; tiene una frontera distinta del bundle
único anterior.

## Límites y decisión

Las mejoras más claras están en las actualizaciones de listas, sus ampliaciones,
lecturas de proxies y memoria por instancia. No hay mejora universal: esta ronda
muestra un aumento aproximado del 7 % al destruir la lista grande y del 5 % al
retirar sus primeras 100 filas. Algunos costes de AOT en frío, activación y
actualizaciones pequeñas también aumentan, como muestran las tablas completas.

Se conserva el conjunto por las correcciones de ciclo de vida, la reducción de
heap y las ganancias en las cargas de listas. No se atribuye a cada cambio
individual toda la ganancia del conjunto. Las mediciones son de esta máquina y
estos escenarios; no se ha rehecho una clasificación global ni una comparación
de FPS/layout del grid. La API de datos crudos sigue requiriendo refresco explícito.

Datos reproducibles: [listas y proxies](runtime-improvements-results.json),
[memoria](runtime-improvements-memory.json), [AOT](runtime-improvements-aot.json),
[scheduler](runtime-improvements-scheduler.json) y
[paquete y chunks](runtime-improvements-sizes.json).
