# Primer uso AOT: intervención conservadora

Medido el 26 de octubre de 2026. Referencia: `774c67a712eab6d001f814851a4708821fbbe2fd`.

Se conserva una optimización pequeña: emitir directamente las hojas con atributos estáticos y sin expresiones en sus hijos de texto. El generador estructural sigue decidiendo cuándo se construyen. Se evita una función por hoja, sin compartir nodos, bindings, listeners ni estado. Los nodos dinámicos mantienen sus funciones y contextos.

También se hace diferida la generación del contenido de `<template>` estructurales. La referencia construía anticipadamente el texto literal de una rama inactiva. El generador nuevo devuelve nodos: sus hijos inmediatos se ejecutan al activar la rama y los fragmentos `g-tpl` se expanden sin introducir arrays dentro del array de nodos.

`GGenerator.ts` y `GTpl.ts` no cambian. Se conserva el planificador asíncrono, el DOM directo, las APIs, JIT, los modos seguros y el contrato de `g`. La salida sigue siendo una expresión asignable: `const generator = /* GCode(html) */;`, con `g` disponible en su ámbito. Los generadores precompilados anteriores siguen aceptándose.

## Protocolo

Chrome 156.0.8078.47 headless, Linux x86_64, Intel i5-2400S (4 núcleos), Node 24.21.0 y esbuild 0.28.2. Quince muestras por escenario y revisión, alternando el orden referencia/propuesta; una página y contexto nuevos por muestra. No se usa perfilador en las muestras de aceptación. No se ejecutan compilaciones de bundles durante esas medidas.

Cada rama contiene 80 filas explícitas con cuatro elementos y texto, bindings de texto y atributo. Se prueban switch de 8/32/64 ramas, if inicialmente falso, lista de dos filas con cuerpos grandes y switch/if/lista anidados. El JavaScript se distribuye como la expresión original de GCode, sin un minificador adicional.

La carga mide la inserción síncrona de un script con la asignación del generador: incluye parseo, compilación y evaluación; excluye red y lectura de disco. El runtime se carga antes, igual en ambas revisiones. El montaje termina con `ready()`. La activación cambia a una rama aún no usada; en if activa la rama inicialmente ausente. Para listas no hay cambio de rama y esa columna representa solo la operación de control.

Las actualizaciones llegan en tareas separadas mediante MessageChannel, sin modificar el planificador del runtime. Se mide desde la mutación hasta drenar 80 microtareas, excluyendo el despacho de la tarea. Se registran las primeras 20, otras 100 de calentamiento y 200 estabilizadas. Se comprueba que el DOM contiene el último valor. Ese drenaje está verificado para estos fixtures, no sustituye a `ready()` como API general.

El segundo montaje coexiste con el primero; después se promedian cuatro montajes adicionales y su destrucción. En if esos montajes posteriores están desactivados. La memoria es el incremento de heap JS de CDP tras GC explícito, respecto de la página con runtime cargado. No mide RSS ni memoria nativa del DOM. Tras destruir se conserva el script/generador cargado: el residual incluye código y metadatos, y no se interpreta como una fuga.

Los tiempos son medianas en ms. Las medianas de las sumas se calculan por muestra: no tienen por qué coincidir con la suma de las medianas de las fases.

## Medidas de aceptación

Referencia → propuesta:

| Escenario | Carga/evaluación | Primer montaje | Primera activación | Carga + montaje | Carga + montaje + activación |
|---|---:|---:|---:|---:|---:|
| switch8 | 15.80 → 15.40 | 34.50 → 31.70 | 6.20 → 5.50 | 50.40 → 47.20 | 57.60 → 52.40 |
| switch32 | 61.10 → 58.40 | 108.70 → 100.30 | 5.20 → 5.10 | 170.00 → 161.80 | 175.00 → 166.60 |
| switch64 | 120.40 → 113.90 | 201.10 → 174.90 | 5.30 → 5.40 | 321.50 → 289.10 | 326.50 → 294.30 |
| if | 2.20 → 1.90 | 5.50 → 5.20 | 7.50 → 8.00 | 8.00 → 7.20 | 16.30 → 15.20 |
| list | 2.10 → 2.00 | 20.30 → 20.60 | 0.10 → 0.10 | 22.30 → 22.70 | 22.40 → 22.80 |
| nested | 4.20 → 3.90 | 26.00 → 25.70 | 6.10 → 6.20 | 30.20 → 29.60 | 36.30 → 35.80 |

| Escenario | Segundo montaje | Montajes posteriores¹ | Primeras actualizaciones | Actualizaciones estabilizadas |
|---|---:|---:|---:|---:|
| switch8 | 3.500 → 3.500 | 3.425 → 3.550 | 0.495 → 0.555 | 0.222 → 0.212 |
| switch32 | 3.300 → 3.200 | 2.900 → 2.850 | 0.370 → 0.385 | 0.179 → 0.177 |
| switch64 | 3.500 → 3.700 | 3.050 → 3.100 | 0.310 → 0.305 | 0.182 → 0.183 |
| if | 0.400 → 0.400 | 0.150 → 0.150 | 0.575 → 0.540 | 0.189 → 0.184 |
| list | 6.400 → 6.200 | 5.550 → 5.300 | 0.695 → 0.790 | 0.334 → 0.329 |
| nested | 7.400 → 7.500 | 6.500 → 6.550 | 0.390 → 0.375 | 0.218 → 0.218 |

¹ Media de cuatro montajes + destrucción dentro de cada muestra; la tabla muestra la mediana de esas medias.

| Escenario | Heap con vista activa (bytes) | Heap residual tras destroy (bytes) |
|---|---:|---:|
| switch8 | 1146108 → 1029696 | 1038968 → 917364 |
| switch32 | 3967876 → 3493600 | 3851884 → 3377644 |
| switch64 | 7723840 → 6774280 | 7603660 → 6658932 |
| if | 189980 → 173804 | 162196 → 145816 |
| list | 623772 → 595932 | 490208 → 462100 |
| nested | 718104 → 673880 | 633260 → 589100 |

La mejora del coste completo es repetible en switch de 32 y 64 ramas. En 64 ramas, carga + montaje baja de 321,5 a 289,1 ms; incluyendo la primera activación baja de 326,5 a 294,3 ms. El heap activo baja de 7.723.840 a 6.774.280 bytes (12,3 %). La salida de ese fixture pasa de 20611 a 15491 funciones arrow. El recuento es de definiciones en la fuente, no de closures vivas.

Las diferencias de if, listas y combinaciones pequeñas no permiten afirmar una mejora de tiempo. Tampoco se detecta una regresión estadísticamente clara en sus tiempos totales o en las actualizaciones. Esto no demuestra igualdad absoluta ni descarta diferencias menores o dependientes de otro motor.

Intervalos bootstrap del 95 % de la mediana de diferencias emparejadas (propuesta − referencia; 10.000 remuestreos, semilla fija, ms):

| Escenario | Coste completo | Primeras actualizaciones | Actualizaciones estabilizadas |
|---|---:|---:|---:|
| switch8 | [-9.2000, 0.6000] | [-0.0950, 0.2700] | [-0.0695, 0.0140] |
| switch32 | [-20.0000, -2.5000] | [-0.0100, 0.1500] | [-0.0090, 0.0135] |
| switch64 | [-40.4000, -15.8000] | [-0.0500, -0.0000] | [-0.0050, 0.0170] |
| if | [-2.5000, 0.5000] | [-0.1000, 0.0650] | [-0.0115, 0.0365] |
| list | [-4.6000, 2.5000] | [-0.0400, 0.2050] | [-0.0155, 0.0190] |
| nested | [-2.1000, 2.4000] | [-0.0700, -0.0100] | [-0.0075, 0.0130] |

En switch de 8 ramas la mediana mejora, pero el intervalo de esta tanda incluye cero. Una tanda exploratoria anterior de siete muestras también mejoró los tres switch; no se usa para aumentar artificialmente el tamaño muestral de la tanda final. Los intervalos son exploratorios, sin corrección por comparaciones múltiples.

## Tamaños exactos

Bytes del JavaScript minificado, antes de comprimir y con gzip nivel 9. Runtime, compilador y módulo completo usan la misma configuración de esbuild en ambas revisiones. El runtime aislado exporta GTpl, GGenerator, GCompileSafe y GregisterDirective, incluidas sus dependencias transitivas. Las restantes fuentes del runtime tampoco cambian; cualquier selección equivalente de exports conserva su tamaño. No hay dependencias de producción nuevas.

| Artefacto | Referencia sin gzip | Propuesta sin gzip | Referencia gzip | Propuesta gzip |
|---|---:|---:|---:|---:|
| Runtime AOT aislado | 26578 | 26578 | 8811 | 8811 |
| Compilador aislado | 15267 | 15566 | 5336 | 5438 |
| Biblioteca completa, esbuild | 41249 | 41550 | 13619 | 13723 |
| Distribución ESM, Rollup/Terser | 41021 | 41327 | 13106 | 13199 |

Las expresiones GCode siguientes se miden como se distribuyen, sin minificación adicional:

| Plantilla | Referencia sin gzip | Propuesta sin gzip | Referencia gzip | Propuesta gzip |
|---|---:|---:|---:|---:|
| switch8 | 190144 | 185664 | 1975 | 1953 |
| switch32 | 760092 | 742172 | 6381 | 6306 |
| switch64 | 1520028 | 1484188 | 12232 | 12080 |
| if | 23784 | 23224 | 595 | 586 |
| list | 23935 | 23375 | 626 | 613 |
| nested | 48135 | 47015 | 958 | 942 |

La distribución se recompila con `npm run build`, que usa Rollup/Terser y conserva el banner y sourcemaps. Detalle de todos sus archivos:

| Archivo dist | Referencia sin gzip | Propuesta sin gzip | Referencia gzip | Propuesta gzip |
|---|---:|---:|---:|---:|
| gtpl.cjs | 41027 | 41333 | 13112 | 13205 |
| gtpl.cjs.map | 67101 | 67575 | 24429 | 24613 |
| gtpl.d.ts | 7093 | 7093 | 2304 | 2304 |
| gtpl.esm.js | 41021 | 41327 | 13106 | 13199 |
| gtpl.esm.js.map | 67104 | 67578 | 24431 | 24615 |
| gtpl.global.js | 41037 | 41343 | 13109 | 13202 |
| gtpl.global.js.map | 67096 | 67570 | 24425 | 24610 |
| **Suma por archivo** | 331479 | 333819 | 114916 | 115748 |

La suma gzip comprime cada archivo individualmente; no representa un tarball npm. La mayor parte de esa suma son mapas de fuentes, que no se cargan para usar plantillas AOT.

## Diagnóstico y alternativas descartadas

La referencia reproduce la asimetría: el primer montaje del switch de 64 ramas ronda 200 ms, frente a unos 3 ms en montajes posteriores. Se capturó un perfil CPU separado. Se plantearon tres causas: compilación diferida de funciones anidadas, asignación de closures por montaje y trabajo del DOM/bindings. El tiempo aparece principalmente al entrar en los generadores y en el código generado; el perfil de muestreo no separa completamente compilación de ejecución. La atribución precisa a una fase interna de V8 es una hipótesis, no una medida independiente.

Se comprobaron las capturas: las funciones generadas necesitan `g`, referencias de otros generadores y el parámetro `o`; nodos y objetos de binding se construyen en cada invocación. Se probó elevar solo definiciones de funciones a un ámbito común y aplanar las funciones por elemento. El runtime permaneció idéntico en todos los experimentos.

- Separación de ramas + eliminación general de funciones por nodo: coste completo del switch64 alrededor de 97 ms y mucha menos memoria, pero las primeras 20 actualizaciones empeoraron. Una repetición de 15 muestras, con actualizaciones en tareas separadas, midió 0,315 → 0,410 ms por actualización. Se descarta pese a mejorar mucho el primer uso.
- Solo separar ramas: mejora el switch64, pero en los ensayos pequeños no mejora listas/if y aumenta ligeramente algunos heaps. Se descarta.
- Solo aplanar elementos: switch64 completo 332,4 → 197,2 ms, pero primeras actualizaciones 0,255 → 0,545 ms en su comparación emparejada. Se descarta.

Parte de las tandas exploratorias ejecutaba las actualizaciones dentro de una misma tarea larga; se conservan identificadas como experimentos. No se mezclan con la tanda final en tareas separadas. El control adicional de dos generadores dentro del mismo realm mostró actualizaciones estabilizadas similares, pero no se utilizó para ocultar la regresión inicial de las variantes descartadas. No se añadió calentamiento artificial a la salida, esperas ni cambios de planificación para disimularla.

## Validación y reproducción

- `npm test`: 49 pruebas, todas pasan.
- `npm run build`: ESM, CJS, global, declaraciones y comprobación del paquete.
- `node --test scripts/benchmarks/*.test.mjs`: 23 pruebas, todas pasan (seis regresiones AOT nuevas).
- `npm --prefix scripts/benchmarks run build`: recompilación completa de los bundles del benchmark, incluidos los adaptadores JIT/AOT y sus chunks/manifest.
- Comprobación adicional en Chrome del bundle AOT reconstruido: dos adaptadores simultáneos, cambio de switch, actualización y destroy pasan.
- Las regresiones ejercitan dos instancias del mismo generador, aislamiento de nodos y bindings, contextos heredados, listas, formularios bidireccionales, eventos, fórmulas, directivas estáticas/dinámicas, watch/refresh, retirada/recreación de ramas, limpieza de bindings y callbacks, destroy, g-is, g-tpl, notif, switches anidados, JIT, las restricciones seguras, AOT con Function deshabilitado y la forma de los generadores antiguos.
- La regresión de texto inactivo falla con el compilador de referencia. El generador nuevo no construye texto, elementos ni directivas de esa rama antes de activarla. Los hashes de las seis expresiones medidas coinciden con los obtenidos del compilador final, después de los ajustes de compatibilidad de template/g-tpl.

Instalar las dependencias existentes del proyecto y de `scripts/benchmarks`. El runner usa Playwright externo a la distribución: `PLAYWRIGHT_MODULE` admite la ruta absoluta a `playwright/index.mjs`; `CHROME` permite seleccionar el ejecutable. En esta máquina:

```sh
export PLAYWRIGHT_MODULE=/home/manu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs
# Antes de modificar la referencia (o en un checkout de la revisión indicada):
npm run build
node scripts/benchmarks/aot.mjs prepare reference
# Después de aplicar la propuesta, conservando artifacts/aot/reference:
npm run build
node scripts/benchmarks/aot.mjs prepare candidate
SAMPLES=15 node scripts/benchmarks/aot.mjs run
# Control opcional de actualizaciones estabilizadas en el mismo realm:
node scripts/benchmarks/aot-updates.mjs
```

`FIXTURES=switch64`, `CANDIDATE=nombre` y `PROFILE=1` permiten acotar un ensayo, comparar otra preparación y guardar perfiles CPU, respectivamente. No activar PROFILE para las medidas de aceptación. El script de benchmark es nuevo y debe copiarse al checkout de referencia si se reproduce desde cero. Las dependencias de producción y el runtime distribuido permanecen intactos.

Los datos completos, las medianas, los intervalos y los hashes están en [aot-results.json](aot-results.json). Los perfiles exploratorios se abren en Chrome DevTools: [referencia](aot-reference.cpuprofile) y [variante separada descartada](aot-rejected.cpuprofile).

La evidencia procede de un único motor y equipo, con fuente en memoria y sin red, pintura ni layout forzado. No se promete una mejora proporcional en Firefox/Safari, en cada plantilla o en la latencia de red. Queda pendiente una alternativa más ambiciosa que reduzca el primer uso sin la penalización inicial observada en las actualizaciones.
