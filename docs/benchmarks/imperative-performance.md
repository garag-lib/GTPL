# Backend imperativo opcional

Implementado el 27 de octubre de 2026 sobre `1965f5b`. Las medidas iniciales
sin alias se conservan como referencia; la versión actual permite activar alias
de claves de métodos con `methodAliases: true`, cuya comparación aparece al final
de este informe. La opción está desactivada por defecto. Se conservan `GCode` y
`GCodeSafe`; `GCodeOptimized` y `GCodeOptimizedSafe` seleccionan explícitamente el
backend nuevo. En esta rama, los benchmarks públicos AOT y JIT seleccionan explícitamente
`GCodeOptimized` con `methodAliases: true`; el manifiesto registra esa selección.

El parser, la composición de directivas estructurales, los contextos reactivos y
el planificador son compartidos. Los nodos ordinarios se emiten como operaciones
DOM directas; el registro de texto llama a `o.addBind` y los atributos mantienen
la resolución de directivas mediante `g.addAttributes`. Los generadores diferidos
se limitan a las fronteras estructurales. Cada invocación crea sus nodos y objetos
de binding. No se usa `cloneNode` ni se comparten registros mutables.

La emisión reproduce el orden del compilador anterior: las hojas estáticas y el
texto se crean durante la evaluación de los hijos, los hijos diferidos se montan
en su posición y los atributos/directivas del padre se registran al final. Los
bloques JavaScript reutilizan nombres locales entre hermanos sin añadir funciones.
Esto limita el tamaño y el coste de compilación de las funciones grandes.

`GAddTo` resuelve iterativamente los generadores y arrays antiguos. Las rutas de
inserción anterior/posterior conservan sus reglas. Los generadores AOT existentes
siguen funcionando; la salida imperativa requiere el runtime actual, con
`g.getDocument()` y `g.addAttributes()`.

## Protocolo

Chrome 156.0.8078.47 headless, Node 24.21.0, Linux x86_64, Intel i5-2400S.
Se preparan ambos compiladores con exactamente el mismo runtime. Cada muestra
utiliza una página nueva; el orden de los backends se alterna. No se ejecutan
compilaciones, perfiladores ni las pruebas durante las medidas finales.

Los escenarios estructurales son los del ensayo AOT anterior: 80 filas explícitas
por rama, switches de 8/32/64 casos, condicional inicialmente inactivo, lista de
dos filas y combinación anidada. `plain` tiene cuatro elementos, dos nodos de
texto, un binding de atributo y uno de texto. En este escenario se mide además el
montaje de 1.000 instancias simultáneas, incluyendo `ready()`; la destrucción se
realiza fuera de ese intervalo. Es una medida posterior al calentamiento del
runtime, distinta del primer montaje.

Carga/evaluación incluye la inserción de la expresión en un script; excluye red y
lectura de disco. El montaje termina con `ready()`. Para actualizar se muta
`tick` en tareas distintas con `MessageChannel` y se drenan 80 microtareas: 20
actualizaciones iniciales, 100 de calentamiento y 200 estabilizadas. Se comprueba
el último valor y la existencia de la rama activa. Este drenaje está validado
para los fixtures y no sustituye a `ready()` como API general.

El heap es el incremento de memoria JavaScript comunicado por CDP tras GC, no RSS
ni memoria nativa del DOM. El residual incluye el script y sus metadatos aún
cargados después de destruir la vista; no se interpreta como una fuga. El ensayo
de 1.000 montajes se realiza antes de medir el heap de `plain`, por lo que este
valor incluye sus posibles efectos de calentamiento y metadatos retenidos.

La inspección de funciones se ejecuta por separado en jsdom, con un transformador
AST que cuenta entradas a funciones generadas y un `g` instrumentado que cuenta
llamadas a la factoría genérica. Incluye el render inicial y `ready()`. No cuenta
las funciones internas del runtime ni las nativas del DOM, y no se mezcla con las
muestras de tiempo de Chrome.

## Reproducción

Con las dependencias del proyecto y de `scripts/benchmarks` instaladas:

```sh
npm test
npm run build
node --test scripts/benchmarks/*.test.mjs
BACKEND=legacy node scripts/benchmarks/aot.mjs prepare imperative-legacy
METHOD_ALIASES=0 BACKEND=imperative node scripts/benchmarks/aot.mjs prepare imperative
node scripts/benchmarks/imperative-inspect.mjs imperative-legacy imperative
REFERENCE=imperative-legacy CANDIDATE=imperative RESULTS=imperative-results.json \
  BULK=1 SAMPLES=15 PLAYWRIGHT_MODULE=/ruta/absoluta/playwright/index.mjs \
  node scripts/benchmarks/aot.mjs run
```

`CHROME` permite seleccionar otro ejecutable; `FIXTURES` limita los escenarios.
Los tamaños comparan las expresiones tal como las devuelve el compilador, sin un
minificador posterior; gzip usa nivel 9. Las medidas no permiten extrapolar una
mejora universal a otros motores, plantillas o dispositivos.

## Medidas del backend sin alias (opción predeterminada)

Quince muestras por backend y escenario (210 muestras en total). Las tablas
muestran medianas en ms, salvo el heap, que se expresa en bytes. Cada celda
compara `GCode` → `GCodeOptimized`. Las sumas se calculan por muestra.

| Escenario | Carga | Primer montaje | Primera activación | Carga + montaje + activación |
|---|---:|---:|---:|---:|
| plain | 0.300 → 0.300 | 3.200 → 3.200 | 0.100 → 0.100 | 3.500 → 3.500 |
| switch8 | 14.400 → 12.900 | 32.200 → 25.900 | 5.400 → 6.900 | 51.500 → 46.000 |
| switch32 | 56.700 → 51.200 | 101.800 → 75.600 | 5.300 → 7.000 | 165.300 → 133.400 |
| switch64 | 114.000 → 95.700 | 188.400 → 132.400 | 5.200 → 7.100 | 306.900 → 236.300 |
| if | 2.000 → 2.400 | 5.600 → 5.300 | 8.100 → 9.400 | 15.800 → 16.200 |
| list | 2.300 → 2.100 | 21.200 → 20.500 | 0.100 → 0.100 | 24.300 → 22.700 |
| nested | 3.900 → 3.900 | 22.600 → 25.000 | 9.900 → 9.900 | 36.100 → 38.900 |

| Escenario | Montajes posteriores¹ | Primeras actualizaciones | Actualizaciones estabilizadas | Heap activo | Heap tras destroy |
|---|---:|---:|---:|---:|---:|
| plain | 0.300 → 0.250 | 0.135 → 0.105 | 0.035 → 0.036 | 202324 → 199008 | 110640 → 103520 |
| switch8 | 3.750 → 3.000 | 0.465 → 0.455 | 0.218 → 0.209 | 1031212 → 320588 | 918308 → 234984 |
| switch32 | 2.975 → 2.575 | 0.505 → 0.480 | 0.182 → 0.181 | 3494952 → 340228 | 3378760 → 248084 |
| switch64 | 3.200 → 2.750 | 0.320 → 0.400 | 0.188 → 0.190 | 6780348 → 361736 | 6659532 → 265360 |
| if | 0.325 → 0.250 | 0.570 → 0.525 | 0.210 → 0.215 | 173408 → 135068 | 143580 → 108644 |
| list | 5.500 → 4.750 | 0.925 → 0.900 | 0.328 → 0.337 | 592552 → 510608 | 453988 → 376300 |
| nested | 6.775 → 5.950 | 0.410 → 0.425 | 0.233 → 0.220 | 670668 → 555004 | 585824 → 471792 |

¹ Media de cuatro montajes y destrucciones en cada muestra; se presenta la mediana de esas medias.

Montar 1.000 instancias de `plain`, con `ready()` en cada instancia y destrucción fuera del intervalo: **57.200 → 53.700 ms**.

Intervalos bootstrap emparejados del 95 % de la mediana de las diferencias (imperativo − referencia; 10.000 remuestreos, semilla 20261027, ms):

| Escenario | Coste completo | Primeras actualizaciones | Estabilizadas |
|---|---:|---:|---:|
| plain | [-0.7000, 0.4000] | [-0.0450, 0.0150] | [-0.0070, 0.0055] |
| switch8 | [-6.9000, -3.7000] | [-0.0400, 0.2000] | [-0.0335, 0.0005] |
| switch32 | [-34.0000, -28.6000] | [-0.1400, 0.0650] | [-0.0095, -0.0005] |
| switch64 | [-85.1000, -61.2000] | [0.0450, 0.2100] | [-0.0140, 0.0130] |
| if | [0.0000, 3.3000] | [-0.1850, 0.1300] | [-0.0195, 0.0220] |
| list | [-3.0000, 3.1000] | [-0.3000, 0.1500] | [-0.0325, 0.0275] |
| nested | [-0.6000, 6.8000] | [-0.0300, 0.1400] | [-0.0240, 0.0150] |

El intervalo para los 1.000 montajes es [-7.600, 1.400] ms. Los intervalos son exploratorios, sin corrección por comparaciones múltiples.

## Interpretación del backend sin alias

El coste completo mejora en los switches de 8, 32 y 64 casos. En 64 casos baja de
306,9 a 236,3 ms (23,0 %), y el heap activo de JavaScript de 6.780.348 a 361.736
bytes (94,7 %). El heap residual también cae, aunque el script distribuido crece.

Existe una regresión en las primeras 20 actualizaciones de `switch64`: la media
por actualización de cada muestra pasa de una mediana de 0,320 a 0,400 ms
(+25 %); el intervalo emparejado de la diferencia queda por encima de cero. Las
actualizaciones estabilizadas no muestran una diferencia clara en ese escenario.
No se introduce calentamiento artificial ni se cambia el planificador para
ocultar esa diferencia.

Los 1.000 montajes pasan de 57,2 a 53,7 ms, pero el intervalo incluye cero, de modo
que esta tanda no demuestra una mejora de tiempo en componentes pequeños. Tampoco
permite afirmar una mejora general en listas o combinaciones anidadas. La primera
activación de los switches es más lenta, aunque el coste completo mejora gracias
al montaje inicial. El condicional muestra un coste completo ligeramente mayor.

La optimización resulta útil para estudiar el coste y la memoria de plantillas
con muchas ramas, pero **no sustituye al backend actual por defecto**. El usuario
elige explícitamente `GCodeOptimized` y puede comparar sus propias plantillas.

## Funciones y tamaño de las plantillas

La instrumentación del montaje da el mismo número de elementos DOM con ambos backends. Las definiciones son funciones presentes en la fuente; las entradas cuentan invocaciones hasta completar el montaje inicial.

| Escenario | Definiciones generadas | Entradas a funciones generadas | Llamadas a g() | Fuente (bytes) | gzip (bytes) |
|---|---:|---:|---:|---:|---:|
| plain | 4 → 1 | 4 → 1 | 6 → 0 | 263 → 539 | 172 → 286 |
| switch8 | 1939 → 19 | 252 → 12 | 571 → 9 | 185664 → 394945 | 1953 → 4306 |
| switch32 | 7747 → 67 | 276 → 36 | 595 → 33 | 742172 → 1579053 | 6306 → 15556 |
| switch64 | 15491 → 131 | 308 → 68 | 627 → 65 | 1484188 → 3157991 | 12080 → 30364 |
| if | 244 → 3 | 3 → 2 | 2 → 1 | 23224 → 49421 | 586 → 886 |
| list | 245 → 3 | 487 → 4 | 1128 → 1 | 23375 → 49663 | 613 → 926 |
| nested | 492 → 11 | 493 → 11 | 1134 → 5 | 47015 → 99627 | 942 → 1614 |

El código emitido ocupa más, tanto antes como después de gzip. Eliminar funciones
y llamadas genéricas no garantiza reducir el tamaño de distribución ni acelerar
cada plantilla. El backend queda como opción explícita; los benchmarks públicos
de esta rama usan explícitamente la variante optimizada con alias.

Datos completos, tamaños de bundles, hashes de fuentes y plantillas, muestras e
intervalos: [imperative-results.json](imperative-results.json).

## Validación

- `npm test`: 49 pruebas.
- `node --test scripts/benchmarks/*.test.mjs`: 56 pruebas, incluidas 29 del compilador/AOT (backend anterior, imperativo y variante con alias).
- `npm run build`: ESM, CJS, global, declaraciones y comprobación del paquete.
- Pruebas compartidas entre ambos backends: listas, condicionales, switches, g-is, g-tpl, notif, aislamiento de nodos y bindings, formularios, eventos, estilos, fórmulas asíncronas, orden de directivas y limpieza.
- AOT seguro con evaluación dinámica deshabilitada; generadores antiguos; montaje iterativo con 25.000 niveles de arrays/funciones y compilación de 700 hermanos dinámicos.

Comprobación adicional del bundle global distribuido en Chrome: dos instancias AOT con `Function` deshabilitado, actualización de contexto de fila, cambio de rama y destrucción completa.

## Alias de claves de métodos (versión actual)

La opción `GCodeOptimized(html, { methodAliases: true })` declara los nombres
repetidos una vez en el render raíz y los captura en las fronteras estructurales
que los necesitan. También funciona con `GCodeOptimizedSafe`. Por ejemplo:

```js
const $a = "appendChild", $e = "createElement";
const node = d[$e]("div");
parent[$a](node);
```

Se conserva el receptor del método y se vuelve a consultar su propiedad en cada
llamada, como antes. También se usan alias para `createTextNode`, `createComment`,
`addBind` y `addAttributes` cuando aparecen. No se añaden wrappers, `bind`, `call`
ni funciones por nodo. Solo se declaran las claves utilizadas por la emisión.

Las cifras siguientes comparan el backend imperativo sin alias → con alias. Los
tamaños son exactos para la fuente emitida, sin minificador posterior.

| Escenario | Fuente (bytes) | gzip nivel 9 (bytes) |
|---|---:|---:|
| plain | 539 → 517 | 286 → 308 |
| switch8 | 394945 → 296965 | 4306 → 3516 |
| switch32 | 1579053 → 1186881 | 15556 → 12398 |
| switch64 | 3157991 → 2373563 | 30364 → 24252 |
| if | 49421 → 37247 | 886 → 799 |
| list | 49663 → 37448 | 926 → 842 |
| nested | 99627 → 75118 | 1614 → 1422 |

En `switch64`, la fuente baja un 24,8 % y gzip un 20,1 %. La plantilla pequeña
`plain` reduce su fuente de 539 a 517 bytes, pero gzip crece de 286 a 308 bytes por
el coste de las declaraciones. El código sigue siendo mayor que el backend
original `GCode`; los alias reducen esa diferencia.

Se repite el mismo protocolo en Chrome: 15 muestras por backend y escenario,
orden alterno, página nueva y runtime idéntico (210 muestras). Tiempos en ms y heap
JavaScript en bytes:

| Escenario | Carga + montaje + activación | Primeras actualizaciones | Estabilizadas | Heap activo |
|---|---:|---:|---:|---:|
| plain | 3.200 → 3.700 | 0.115 → 0.100 | 0.036 → 0.039 | 199008 → 199664 |
| switch8 | 46.700 → 48.700 | 0.535 → 0.535 | 0.221 → 0.225 | 323948 → 324628 |
| switch32 | 131.600 → 138.500 | 0.505 → 0.420 | 0.177 → 0.176 | 340228 → 344440 |
| switch64 | 226.200 → 239.500 | 0.380 → 0.390 | 0.176 → 0.175 | 361736 → 366296 |
| if | 15.600 → 15.500 | 0.450 → 0.460 | 0.193 → 0.194 | 130920 → 137428 |
| list | 20.400 → 21.600 | 0.800 → 0.760 | 0.318 → 0.329 | 510408 → 559276 |
| nested | 39.600 → 40.200 | 0.410 → 0.405 | 0.226 → 0.234 | 555004 → 605812 |

Intervalos bootstrap emparejados del 95 % de la mediana de diferencias (con alias − sin alias; 10.000 remuestreos, semilla 20261027, ms):

| Escenario | Coste completo | Primeras actualizaciones | Estabilizadas |
|---|---:|---:|---:|
| plain | [-0.1000, 0.9000] | [-0.0350, 0.0400] | [-0.0040, 0.0105] |
| switch8 | [0.4000, 4.1000] | [-0.1150, 0.1150] | [-0.0115, 0.0205] |
| switch32 | [4.2000, 8.1000] | [-0.1350, 0.1150] | [-0.0105, 0.0015] |
| switch64 | [8.2000, 16.9000] | [-0.0300, 0.0400] | [-0.0065, 0.0000] |
| if | [-0.8000, 2.3000] | [-0.0500, 0.0500] | [-0.0125, 0.0055] |
| list | [-0.5000, 3.2000] | [-0.1700, 0.0350] | [-0.0065, 0.0155] |
| nested | [-4.6000, 5.1000] | [-0.0800, 0.0750] | [0.0025, 0.0200] |

Los 1.000 montajes de `plain` pasan de 55.600 a 56.200 ms; intervalo de diferencias [-2.500, 3.400] ms.

Los intervalos son exploratorios, sin corrección por comparaciones múltiples. En los switches el coste completo aumenta: 46,7 → 48,7 ms, 131,6 → 138,5 ms y
226,2 → 239,5 ms; sus intervalos emparejados quedan por encima de cero. El heap
activo también aumenta en listas y en el caso anidado; en este último las
actualizaciones estabilizadas son algo más lentas. Por estas contrapartidas,
`methodAliases` está desactivado por defecto: el usuario elige reducir tamaño
cuando le compensa el coste de ejecución. El backend sigue siendo opcional. Datos, muestras, tamaños y hashes de esta versión:
[imperative-alias-results.json](imperative-alias-results.json).

Para reproducir la comparación, conservar primero la preparación anterior en
`artifacts/aot/imperative`, y preparar la versión actual con:

```sh
METHOD_ALIASES=1 BACKEND=imperative node scripts/benchmarks/aot.mjs prepare imperative-aliases
REFERENCE=imperative CANDIDATE=imperative-aliases \
  RESULTS=imperative-alias-results.json BULK=1 SAMPLES=15 \
  PLAYWRIGHT_MODULE=/ruta/absoluta/playwright/index.mjs \
  node scripts/benchmarks/aot.mjs run
```

## Configuración publicada en esta rama

`docs/index.html` y todos los adaptadores GTPL del laboratorio (AOT, JIT,
patrones, cuadrícula y suite general) seleccionan `GCodeOptimized` con
`methodAliases: true`. El manifiesto publicado registra esa configuración en
`gtplCompiler`; las preparaciones independientes de `aot.mjs` usan lo mismo por
defecto y guardan `config.json`. La API de la biblioteca mantiene sus opciones
predeterminadas para preservar la compatibilidad.

Tras reconstruir los bundles se comprobaron en Chrome los 22 adaptadores GTPL
publicados (nueve patrones, cuadrícula y suite general, en AOT y JIT), incluidas
actualizaciones, dos instancias simultáneas de cada patrón y destrucción. Las 11
demostraciones de `index.html` terminaron `ready()` usando el backend y los alias
seleccionados, sin errores de página; se comprobó también la interacción de la
demostración condicional. Una regresión verifica la configuración del manifiesto
y los tamaños, gzip y SHA-256 de los bundles GTPL y sus dependencias compartidas.
