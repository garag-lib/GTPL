# Mejoras y errores de GTPL para retomar por separado

Fecha: 4 de noviembre de 2026.

Este documento conserva los hallazgos de la sesión para pedir su implementación
en otra sesión. El usuario ha decidido descartar la rama experimental porque
mezclaba cambios distintos. **Las correcciones y mejoras descritas aquí no se
han incorporado a `main`.**

La base de trabajo es GTPL 3.0.0, `main` en
`cc93a6ca3b9955a6150867b0299e1154393d66ba`. Se descarta
`codex/gtpl-keyed-performance` y su worktree `GTPL-keyed-performance`.
No depender de esa rama, de sus archivos temporales ni de sus artefactos para
retomar el trabajo: reproducir cada caso sobre la versión principal vigente.

## Estado tras la implementación del 4 de noviembre de 2026

Los puntos **1–7** y las **nueve oportunidades adicionales** se han abordado en
`codex/gtpl-correcciones-mejoras`. El punto **8 (`g-key`) queda descartado** por
petición expresa del usuario. La implementación del runtime y paquete está en
`3e80129`, precedida por las correcciones independientes de ciclo de vida en
`dac72f2`. Estos cambios siguen fuera de `main`.

El [informe de implementación y mediciones](docs/benchmarks/runtime-improvements.md)
detalla las decisiones, 421 pruebas, validación de GTPLWeb/Sanmateo, reducción
de memoria y resultados de rendimiento, incluidas las regresiones medidas.
La creación bajo demanda se aplica a estructuras privadas; las colecciones
públicas conservan su contrato. La reutilización JIT se documenta sobre la API
existente, sin añadir una caché global de plantillas.

El resto de este fichero conserva el diagnóstico y las recomendaciones
históricas de la rama descartada; sus cifras no son los resultados del trabajo
nuevo. Para el estado actual debe consultarse el informe enlazado.

## Decisiones para la próxima sesión

- Elegir una tarea de este documento y hacerla en una rama independiente.
  Separar correcciones, optimizaciones, cambios de paquete y funciones nuevas.
- Corregir en el lugar de origen; no introducir soluciones provisionales en
  GTPLWeb o Sanmateo para ocultar un fallo de GTPL.
- Conservar JIT, AOT, generadores anteriores, directivas, formularios,
  herencia de contextos, getters, watchers, asincronía y limpieza.
- Utilizar los benchmarks del propio proyecto. La evaluación de
  js-framework-benchmark se canceló; no retomarla ni usarla como objetivo.
- No publicar, subir cambios, crear releases ni integrar en `main` sin una
  nueva petición del usuario. La eliminación del modo Safe ya pertenece a
  GTPL 3.0.0; no reintroducirlo ni repetir esa tarea.
- Los originales de GTPLWeb y Sanmateo no recibieron el código experimental.
  La compatibilidad se comprobó en copias aisladas.

## Errores confirmados y correcciones ensayadas

### 1 Fuga de bindings que dependen de varios ancestros

Origen: `src/GTpl.ts`, funciones `addBind2Object`, `delBind` y `destroy`.

`BindMap` guarda un único contexto por binding. Cuando una fórmula depende de
dos ancestros distintos, cada `BindMap.set(bind, ctx)` sobrescribe el anterior.
Al destruir la vista propietaria se limpia su árbol local y el último contexto,
pero puede quedar una referencia en otro ancestro todavía vivo.

Reproducción:

1. Crear un abuelo con `grand`, un padre con `parent` y un hijo con `local`.
   Dar a padre e hijo sus contextos propios y enlazarlos mediante `parent`.
2. En el hijo registrar una fórmula con las variables `grand`, `parent` y
   `local`, comprobando que los tres cambios actualizan el texto.
3. Destruir solamente el hijo, manteniendo vivos los dos ancestros.
4. Repetir la creación y destrucción diez veces. Los árboles de los ancestros
   no deben acumular bindings cuyo propietario esté destruido.

En el diagnóstico con jsdom y GC explícito, antes de corregir quedaron diez
bindings residuales y diez de diez hijos destruidos seguían vivos mediante
`WeakRef`. Al retirar únicamente la referencia residual del ancestro se
recogieron los diez, identificando la causa de la retención.

Solución ensayada: mantener compatible el `BindMap` público y registrar los
contextos adicionales en una tabla débil privada por propietario. Crear esa
metadata solo al aparecer un segundo contexto heredado distinto. Al destruir,
retirar el binding de todos sus contextos y borrar la metadata. El caso habitual
con un solo contexto no necesita otro `Set`.

Resultado del diagnóstico corregido: cero bindings residuales y cero de diez
hijos retenidos. Se añadieron ocho regresiones: seis órdenes de variables,
24 ciclos de recreación y convivencia con hermanos vivos, callbacks y watchers
reentrantes. Las ocho fallaban antes y pasaron después.

Recrear esas pruebas en `tests/bindmap-cleanup.test.ts`. Mantener el orden actual
de los callbacks de limpieza y las reacciones de los ancestros supervivientes.
Esta corrección estaba sin commit y se descarta con la rama.

### 2 ready de un hijo nuevo termina antes de su primer render asíncrono

Origen: `src/GTpl.ts`, `queueChange`, `trackInitialUpdate`,
`finishBindingChange`, `cancelBindingChange` y `addBind`.

La decisión de registrar trabajo inicial consulta el estado de la raíz. Si
el padre ya terminó `ready()`, un hijo nuevo puede quedar fuera del seguimiento
de su propio montaje inicial.

Reproducción mínima:

1. Crear un padre y esperar `parent.ready()`.
2. Crear y montar un hijo que tenga ese padre y una fórmula que devuelve una
   promesa controlada todavía pendiente.
3. Llamar a `child.ready()`. Debe permanecer pendiente mientras el texto siga
   esperando el resultado de la fórmula.

Antes del arreglo, `child.ready()` se resolvía con el texto vacío. Se reprodujo
tanto con datos locales como heredados. Los controles sin padre o con padre
todavía pendiente sí esperaban correctamente.

Solución ensayada: un `WeakSet` identifica bindings cuyo primer trabajo sigue
pendiente. La fase inicial sigue activa si lo está la raíz, o si el propietario
todavía no está listo y el binding tiene ese primer trabajo pendiente.
`trackInitialUpdate` incluye los contextos no resueltos aunque la raíz ya esté
lista. La marca se conserva al sustituir trabajos y se elimina únicamente al
terminar el trabajo vigente o cancelarlo.

No basta usar siempre el estado individual del hijo: muchos hijos generados
no reciben una llamada explícita a `ready()`, y eso volvería a crear promesas
en todas sus actualizaciones posteriores. Tampoco debe reabrirse la promesa
ya resuelta del padre.

Se añadieron doce regresiones a `tests/ready.test.ts`: datos locales/heredados,
rechazo antes/después de pedir `ready`, destrucción pendiente, descendientes
generados y sustitución de tres trabajos asíncronos. Diez fallaban antes;
los otros dos eran controles. Todas pasaron tras el arreglo. `async_hooks`
confirmó cero promesas nuevas en actualizaciones síncronas posteriores,
incluida la descarga de la cola, sin llamar a `ready()` del hijo.

Esta corrección también estaba sin commit y se descarta con la rama.

### 3 Índices incorrectos al actualizar listas transformadas

Origen: `src/GTpl.ts`, clasificación de listas directas y `updateFORbind`.

Una pista de índice procedente del array original no necesariamente identifica
la misma fila después de un filtro o transformación. Se corrigió en la rama
evitando aplicar el camino incremental de índices a listas transformadas.
Estas conservan reconciliación completa.

Antes de trasladarlo, crear una regresión sobre `main` con elementos excluidos
por un filtro y un cambio anidado de una fila incluida; comprobar también
entrada/salida del filtro, orden y salida completa. No presentar esta corrección
como una razón para retirar filtros o getters.

### 4 Limpieza de una construcción fallida

Origen: `src/GTpl.ts`, constructor y `loadOptions`.

Una directiva puede lanzar una excepción después de registrar recursos,
listeners, bindings o hijos. Si el constructor falla, quien lo llamó no recibe
la instancia para destruirla. La rama añadió limpieza de la construcción
parcial antes de propagar el error original.

Reaplicar como corrección independiente, con una directiva que registre
recursos y falle. Comprobar retirada de nodos, listeners y suscripciones,
callbacks exactamente una vez y conservación del error original.

## Mejoras implementadas en la rama descartada

### 5 Actualizaciones incrementales de listas directas

Origen principal: `src/GTpl.ts`, trabajos pendientes, notificación de
dependencias y reconciliación de `g-for`.

Se distinguieron cambios de propiedades de filas, asignaciones de índices y
cambios estructurales. Para cambios anidados de filas ordinarias se evitaban
copias y reasignaciones completas cuando las propias suscripciones ya habían
notificado el cambio. El recorrido de dependencias seguía directamente la
propiedad modificada, en lugar de enumerar todos sus hermanos.

Contratos que deben conservarse:

- `refresh()` y la asignación explícita de la misma referencia deben reflejar
  cambios hechos directamente sobre datos crudos.
- Los getters pueden depender de datos ajenos a los caminos declarados.
  Esos casos conservaban reconciliación completa, sin ejecutar getters solo
  para inspeccionar su descriptor.
- Los cambios combinados deben reconciliar el estado final, no reproducir
  pistas antiguas de índices.
- Los watchers conservan cada notificación pública aunque el trabajo de DOM
  se agrupe.

En una prueba propia con 100 cambios entre 1.000 filas se observaron
3.001 → 101 ejecuciones de bindings, 1.000 → 0 reasignaciones internas y
1.000 → 0 referencias copiadas. Ambas versiones hicieron 100 escrituras de
texto y 100 notificaciones de watcher.

### 6 Reutilizar el índice de suscripciones de proxies durante lecturas

Origen: `src/GProxy.ts`, `ProxySubscription`, `proxyChild`,
`addProxySubscription` e índice de caminos.

La suscripción guardaba una referencia al nodo de su índice para reutilizarlo
al leer hijos. Se evitaron copias de caminos y búsquedas repetidas de
suscripciones ya existentes. Los propietarios primitivos conservaban el
comportamiento anterior y los índices de objetos seguían siendo débiles.

Probar aliases, referencias compartidas, símbolos, autorreferencias,
revocación, iteración y propietarios que se dan de baja durante callbacks.
Separar esta optimización de cualquier cambio en el orden de notificaciones.

### 7 Entrada pública de runtime para AOT

La rama añadió `@mpeliz/gtpl/runtime` sin cambiar la entrada principal ni
retirar JIT. Separó la implementación del generador de la compilación dinámica,
y emitió chunks compartidos ESM/CJS y tipos compartidos. Las dos entradas
compartían clases, proxies y registro de directivas dentro de cada formato.

Reaplicar como tarea de empaquetado independiente. Comprobar identidad de
exports, tipos nominales, imports ESM/CJS, generadores anteriores, CSP y ausencia
de `DOMParser` y compilación dinámica en el bundle de runtime.

Con los mismos exports `GTpl`, `GGenerator` y `GregisterDirective`, un bundle
esbuild minificado ES2020 pasó de 19.256 bytes gzip para la entrada completa a
12.986 para runtime: un 32,6 % menos en ese bundle concreto. No es el tamaño
universal de una aplicación ni del tarball.

Este cambio exige que los medidores de distribución recorran todos los chunks
transitivos. Medir solo `gtpl.esm.js` dejaría de representar la biblioteca
completa. Esa actualización de herramientas debe acompañar al empaquetado.

### 8 Listas con claves opcionales — descartado

Descartado expresamente en esta implementación. Se conserva la descripción
histórica siguiente como referencia; no se incorpora al código.

Función nueva, separada de las correcciones anteriores. La sintaxis ensayada
fue `g-for="rows;i;row" g-key="row.id"`, con rutas anidadas o `g-key="row"`
para valores primitivos. Sin `g-key`, seguía el comportamiento por índices.

La compilación validaba la directiva, el alias y su convivencia con `g-for`
en los tres backends. El runtime aceptaba claves únicas string o número finito,
reutilizaba contexto y nodos por clave y minimizaba movimientos mediante una
subsecuencia creciente. Las claves inválidas se detectaban antes de modificar
la estructura de la lista.

La prueba de intercambio de posiciones 1 y 998 movía exactamente dos filas,
creaba cero filas y conservaba las 1.000 identidades DOM. También se ensayaron
claves modificadas, fragmentos, condicionales y reemplazo del objeto con la
misma clave.

Requisitos descubiertos al implementar esta función: descartar filas creadas
parcialmente si un callback destruye el padre o sustituye la lista; impedir
trabajo obsoleto; mantener bindings iniciales cuando un callback de conexión
amplía la lista; limpiar mapas de claves al retirar bindings. Son protecciones
de la función nueva, no una afirmación de que todos esos fallos existan en
las listas indexadas actuales de `main`.

## Medidas propias de la rama descartada

Estas cifras compararon GTPL 3.0.0 con el conjunto de optimizaciones anterior
a las dos últimas correcciones de herencia y `ready`. No aíslan la contribución
de cada cambio ni justifican aplicar el conjunto entero.

Chrome 156.0.8078.79, Node 24.22.1, Linux x86_64, Intel i5-2400S.
Quince pares por tamaño, orden alterno, página nueva por muestra y la misma
plantilla AOT sin claves, con `GCodeOptimized` sin alias. Compilación y creación
de datos fuera del reloj; final con DOM comprobado, sin forzar layout/pintura.

| Filas iniciales | Operación | Referencia ms | Rama ms | Cambio |
|---:|---|---:|---:|---:|
| 1.000 | Montar | 106,6 | 106,7 | +0,1 % |
| 1.000 | Actualizar 100 etiquetas | 24,0 | 4,4 | −81,7 % |
| 1.000 | Añadir 1.000 | 84,7 | 74,3 | −12,3 % |
| 1.000 | Destruir 2.000 | 65,1 | 68,2 | +4,8 % |
| 10.000 | Montar | 702,1 | 724,4 | +3,2 % |
| 10.000 | Actualizar 1.000 etiquetas | 166,3 | 22,6 | −86,4 % |
| 10.000 | Añadir 1.000 | 218,0 | 70,7 | −67,6 % |
| 10.000 | Destruir 11.000 | 343,7 | 354,3 | +3,1 % |

La mejora estaba en actualizaciones y ampliación; montaje grande y destrucción
empeoraron. No presentar la rama como una mejora de todas las operaciones.

En cinco ciclos por variante de 1.000 filas, los objetos observados se
recogieron tras destruir y ejecutar GC: 1.001 proxies, 1.001 nodos y 1.001
instancias por ciclo, en referencia, candidato indexado y candidato con claves.
Ese escenario no incluía la herencia de tres niveles que después reveló la fuga.

La mediana del incremento de heap activo fue 4.388.672 bytes en la referencia,
4.409.208 en el candidato indexado y 4.469.900 con claves. No hubo reducción de
heap activo. El residual tras destruir puede incluir código y metadatos; por
sí solo no demuestra una fuga.

## Oportunidades adicionales todavía sin medir

No están implementadas ni tienen una ganancia de rendimiento demostrada.

| Mejora candidata | Origen y precaución | Comprobación propia |
|---|---|---|
| Desuscripción de proxies en una pasada | `GProxy.ts`, `removeSubscriptionsFromTarget`: `filter`, `removed.includes` y `remaining.some` repetidos pueden crecer cuadráticamente. Conservar snapshots de notificación y propietarios supervivientes. | Retirada de 10/100/1.000 aliases compartidos, sustitución y revocación durante callbacks. |
| Atributos ordinarios con menos asignaciones | `GGenerator.ts`, `resolveDirective` y `addArributes`: evitar `split(':')` cuando no hay separador y crear la lista de directivas pendientes solo cuando sea necesaria. | Montaje de estilos, clases, atributos, formularios y ramas grandes; directivas registradas después de compilar y callbacks síncronos de custom elements. |
| Switch síncrono sin promesa incondicional | `GTpl.ts`, `updateSWITCHbind`, actualmente `async`. Crear continuación solo al encontrar un resultado asíncrono. Conservar orden, primer caso coincidente, comparación `==` y cancelación. | Switch de 8/32/64 ramas, primera/última rama, retirada, reentrada y casos asíncronos sustituidos. |
| Menos trabajo por binding inicial | `trackInitialUpdate` crea promesas, observadores, sets y recorridos de ancestros. Estudiar una barrera por componente/lote después de resolver correctamente el error 2. | AOT plain/list/nested, montaje masivo, rechazo, destrucción y descendientes dinámicos. Contar asignaciones fuera de los timings. |
| Refresco heredado sin promesas públicas innecesarias | `refresh` usa `launchChange` en `BindMap`; esa API siempre devuelve una promesa. Estudiar el camino automático interno sin cambiar la API pública ni el seguimiento inicial. | `refresh()` con varios contextos, datos crudos, errores y fórmulas síncronas/asíncronas. |
| Menos recorridos de ancestros | `queueChange` vuelve a localizar la raíz incluso al fusionar trabajos. Cualquier caché debe respetar la semántica de herencia y montaje tardío. | Scheduler con profundidades 1/5/20; mismos cálculos, escrituras y watchers. |
| Prefijos de watchers sin copias repetidas | `emitWatchers` reconstruye prefijos mediante `slice().join()` en dos bucles. Preservar orden, comodines, claves con puntos y cambios de suscripción durante callbacks. | Comparar la secuencia completa de eventos con rutas profundas. |
| Estructuras internas creadas bajo demanda | Cada instancia crea varios sets y un mapa de watchers. El acceso público a esas estructuras limita una sustitución transparente. | Heap de 1.000/10.000 instancias, con/sin watchers, registro tardío y liberación tras destruir. |
| Reutilización explícita de generadores JIT | La API ya permite compilar una vez y montar varias instancias. No introducir un caché transparente por HTML: `g-tpl` puede leer el documento durante compilación. | Separar JIT frío, JIT preparado y AOT; instancias simultáneas, documentos distintos y limpieza. |

## Uso del laboratorio propio

Fuentes que permanecen en `main`:

- `docs/benchmarks/README.md` y `docs/benchmarks.html`.
- `scripts/benchmarks/method-definitions.mjs`, `method-adapters.mjs` y
  `docs/benchmarks/method-runner.js`: switch, for, if, estilos, clases,
  atributos y formularios.
- `scripts/benchmarks/aot.mjs`: carga/evaluación, primer montaje, activación,
  montajes posteriores y actualizaciones frías/estabilizadas.
- `scripts/benchmarks/scheduler.mjs` y `grid-runtime.mjs`: notificaciones,
  cálculos, DOM, actualización de celdas y layout.
- Los informes `general-performance.md`, `imperative-performance.md`,
  `aot-performance.md` y `scheduler-performance.md`, bajo `docs/benchmarks`,
  contienen evidencia histórica y sus límites.

Antes de medir cambios nuevos:

1. Guardar una referencia limpia y reconstruir biblioteca y adaptadores en
   una copia aislada; hacer lo mismo con el candidato y las mismas dependencias.
   Conservar fuentes, manifiesto, hashes y resultados por separado. El build
   del laboratorio escribe en `docs/benchmarks` del checkout utilizado.
2. Comprobar que los bundles corresponden a la fuente medida. En esta sesión
   el manifiesto publicado, los datos generales del 28 de octubre y la fuente
   experimental eran snapshots diferentes. `rank.mjs` verifica archivos
   contra el manifiesto, pero no que este represente el `src` actual.
3. Mantener el caso For existente, que sustituye arrays completos, y añadir
   por separado cambios anidados, `push`, `splice` y movimiento con claves.
   Comprobar también identidad DOM cuando ese sea el contrato medido.
4. Conservar la distinción entre tiempo hasta DOM, DOM más layout, cadencia,
   heap JS y memoria total estimada del entorno. `refreshMs` del laboratorio
   es el intervalo de frames en reposo, no el coste de `GTpl.refresh()`.
5. Comparar configuraciones iguales. Los adaptadores publicados eligen
   `methodAliases: true`; `aot.mjs` permite comparar legacy, imperative y
   imperative con alias. No mezclar sus resultados.
6. Medir secuencialmente, sin builds, tests ni otro navegador de pruebas
   compitiendo por CPU. Empezar por los escenarios afectados, sin una
   clasificación global como criterio de éxito.

El grid usa una instancia completa por celda; reducir el coste por instancia
es distinto de optimizar una lista. Parte importante de sus tiempos puede ser
layout. Las ramas diferidas, reentrada, formularios y granularidad son ventajas
funcionales que deben mantenerse y verificarse junto con los tiempos.

## Validación completada y límites

Antes de las dos últimas correcciones, la rama pasó 127 pruebas del núcleo,
281 de compiladores/herramientas/regresiones propias, 51 de GTPLWeb y 60
seleccionadas de Sanmateo. También se comprobaron paquete, tipos, singletons,
listas, ready/destroy y selects dinámicos en copias aisladas.

Después de corregir la fuga y `ready`, pasaron 147 pruebas del núcleo, la
comprobación TypeScript y `git diff --check`. La reconstrucción completa
`npm run build`, incluida `test:package`, terminó correctamente. No se repitió
la batería de 281 ni GTPLWeb/Sanmateo sobre esas dos últimas correcciones antes
de descartar la rama. Tampoco se midió su coste de rendimiento.

Esos recuentos corresponden al conjunto experimental: no son el número esperado
al reaplicar una única tarea sobre `main`. Cada cambio deberá reproducir su
fallo y superar las pruebas apropiadas de forma independiente.

## Orden recomendado para pedir el trabajo

1. Corregir solo la fuga de varios ancestros.
2. Corregir solo `ready()` en hijos montados después del padre.
3. Reproducir y separar las correcciones de listas transformadas y construcción
   fallida.
4. Elegir una optimización pequeña del runtime, medirla con el laboratorio
   propio y conservarla únicamente si sus ventajas compensan los costes.
5. Tratar runtime AOT separado y listas con claves como tareas independientes,
   con sus propias decisiones de API, paquete y compatibilidad.

Ejemplo para una próxima sesión: «Lee MEJORAS_Y_ERRORES_PENDIENTES.md e implementa
únicamente el punto 1 en una rama nueva desde main. Reproduce primero la fuga,
conserva la API y comprueba la limpieza. No publiques ni mezcles otras mejoras».

## Skills sugeridas para retomar

- `diagnose`: reproducción y comprobación de los fallos de memoria o montaje.
- `tdd`: si se elige trabajar primero con las regresiones descritas.
- `handoff`: actualizar este registro al cerrar una nueva sesión.

El archivo queda en la raíz de `main` por petición del usuario. No constituye
autorización para implementar todos sus puntos ni para recuperar la rama
descartada.
