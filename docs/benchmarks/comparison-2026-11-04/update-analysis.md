# Listas completas y atributos: diagnóstico sin cambiar los contextos de GTPL

Este documento conserva el diagnóstico y los experimentos anteriores a la
[implementación y validación posterior](../update-implementation.md).

4 de noviembre de 2026. Base: `81efcb65abce80ca25078d37a6e5f01427d8e32c`.
Las propuestas conservan los contextos por fila, la herencia, los proxies y la
reconciliación por posición. No incorporan `g-key`. Los experimentos se ejecutaron
en una copia temporal: **ninguno está aplicado al código de `src`**.

## Qué distancia hay

La [comparación completa](general-performance.md) contiene 560 muestras iniciales
y 54 de confirmación del grid, todas válidas. GTPL AOT queda quinto entre seis
frameworks de producción en el índice combinado de seis casos DOM. Sus distancias
aproximadas son +26 % respecto a React, +19 % a Vue, +8 % a Svelte y +6 % a Angular.
El índice incluye montaje, que no se propone modificar aquí, y no representa el
rendimiento de cualquier aplicación. Las diferencias pequeñas tienen incertidumbre.

Medianas de las operaciones relevantes del benchmark original, en milisegundos:

| Operación | GTPL AOT | React | Vue | Svelte | Angular |
|---|---:|---:|---:|---:|---:|
| Actualizar lista de 500 | 21,95 | 13,04 | 15,06 | 17,08 | 11,28 |
| Añadir 125 a 500 | 20,02 | 8,74 | 8,72 | 18,06 | 6,76 |
| Reducir 500 a 250 | 15,65 | 7,06 | 8,34 | 7,51 | 5,84 |
| Invertir 500 | 20,54 | 21,28 | 20,89 | 38,82 | 20,54 |
| Sustituir 500 por otros IDs | 22,82 | 22,83 | 21,73 | 28,17 | 24,00 |
| Atributos y texto de 500 botones | 16,60 | 11,37 | 16,91 | 18,01 | 10,77 |

No pierde en todo: invertir la lista empata aproximadamente con React, Vue y
Angular y mejora a Svelte; sustituir IDs resulta competitivo. El propio caso de
atributos está cerca de Vue y por delante de Svelte. También destacan el regreso
a una vista condicional y la memoria de ramas no activadas; están en el informe general.

## 1. Sustitución de arrays completos

### Qué hace realmente el benchmark

`method-runner.js` crea objetos nuevos para todas las filas en cada operación.
«Añadir» equivale a `[...rows(500), ...rows(125, tick, 500)]`, no a un `push`
sobre la lista existente. Las 500 primeras filas mantienen sus valores, pero
cambian de identidad. GTPL conserva sus contextos y elementos por posición.

En `updateFORbind`, una asignación completa no entra en el camino incremental:
reasigna `root[row]` en cada contexto superviviente. El setter de
`createGetterAndSetter` retira las suscripciones anteriores, conecta el nuevo
valor y notifica sus bindings. El refresco de datos crudos depende de este
comportamiento: no se puede convertir una asignación de la misma referencia en
un simple `return`.

Contadores independientes de los tiempos, con la misma estructura de 500 filas:

| Trabajo por operación | Añadir 125 | Actualizar 500 | Reducir a 250 |
|---|---:|---:|---:|
| Asignaciones de propiedades raíz | 501 | 501 | 251 |
| Suscripciones retiradas | 501 | 501 | 501 |
| Suscripciones creadas | 626 | 501 | 251 |
| Nodos nuevos del índice de suscripciones | 1.252 | 1.002 | 502 |
| Bindings evaluados, incluido el bucle | 1.876 | 1.501 | 751 |
| Visitas de clasificación de datos ordinarios | 2.502 | 2.002 | 1.002 |
| Escrituras de texto | 250 | 500 | 250 |

Las 250 escrituras al añadir corresponden a los dos textos de cada fila nueva.
Los textos antiguos ya evitan escrituras iguales; aun así, se paga por reconectar,
encolar y calcular. Sustituir el array conservando las referencias de las filas
produce los mismos contadores: el refresco completo también fuerza esas asignaciones.

### Candidatos concretos

1. **Clasificar los datos solo cuando se necesite el camino incremental.**
   Actualmente se inspeccionan recursivamente los descriptores incluso cuando
   la asignación completa obliga a reconciliar todas las filas. El experimento
   cambia una condición: `ordinary = !!job.listUpdate && isOrdinaryData(rows)`.
   La siguiente modificación parcial tras una sustitución completa debe hacer
   la clasificación pendiente. No elimina la protección de getters; desplaza
   ese trabajo a cuando puede servir para omitir reconciliación.
2. **Reutilizar metadatos de suscripción al reasignar una fila.** El propietario
   y su ruta raíz siguen siendo el mismo contexto aunque cambie el objeto.
   Conviene investigar una operación interna de reconexión que conserve ese
   tramo del índice y evite recrear Maps/Sets. Tiene que retirar los targets
   antiguos, respetar otros propietarios y mantener la revocación correcta.
   No se ha implementado ni cuantificado una ganancia para esta propuesta.
3. **Analizar la limpieza al reducir listas.** En el perfil calentado de este
   diagnóstico, `destroy` aparece en aproximadamente el 33 % del tiempo muestreado
   de reducción, con retirada de nodos y atributos entre sus costes. Eso no es
   tiempo enteramente eliminable: hay que conservar callbacks, listeners,
   referencias, destrucción de hijos y limpieza de bindings heredados.

En la operación de añadir, la reasignación de valores de contextos existentes
aparece en torno al 25 % del tiempo muestreado; incluye reconexión y notificación.
No es una predicción de mejora del 25 %. La creación necesaria de las 125 filas
nuevas queda fuera de la propuesta de cambiar el modelo de contextos.

No recomendaría saltar filas solo por igualdad de referencia ni comparar
únicamente los objetos anteriores: una mutación cruda puede haber cambiado esos
objetos sin actualizar el DOM. Las fórmulas, getters y watchers también tienen
semántica observable que se debe conservar.

## 3. Atributos y texto

### El coste localizado

El caso usa `<button g-attr="attrs">{{tick}}</button>` en 500 filas. Una
actualización evalúa 500 bindings de atributos y 500 de texto, una vez cada uno.
La cola ya agrupa los avisos; no hay un fallo general de deduplicación del render.

La enumeración `for (let key in result)` de `updateATTRbind` se realiza sobre el
proxy de `attrs`. Con tres propiedades son 500 llamadas a `ownKeys`, 1.500 a
`getOwnPropertyDescriptor` y 1.500 comprobaciones de propiedades DOM. El mismo
objeto atraviesa ese proceso para cada botón.

El experimento sustituye solo la fuente de las claves:

```ts
for (let key in toRaw(result)) {
  bind.attrs.push(key);
  updateProperty(key, result[key]);
}
```

Las lecturas de valores siguen pasando por `result`, conservando su receiver
reactivo. Se mantienen los bindings, la retirada de atributos ausentes y las
comparaciones contra propiedades/atributos reales del DOM. No introduce una
caché compartida de resultados ni asume que los getters sean puros.

### Otras oportunidades delimitadas

- **Usar la ruta modificada en `g-attr`.** Cambiar solo `attrs.title` sigue
  comprobando las tres propiedades en cada botón. Una vía para cambios de una
  clave podría reducir 1.500 comprobaciones a 500. Hay que definir y probar
  borrados, altas, cambios agrupados, atributos heredados, getters, directivas y
  sincronización con modificaciones externas del DOM. Una asignación completa
  o `refresh()` debe conservar el recorrido completo. No está implementado.
- **Evitar registros reactivos duplicados en la herencia.** Se ha reproducido
  que el primer binding heredado puede crear dos entradas `BindDef` para la
  misma propiedad: la llamada inicial crea el descriptor y la llamada recursiva
  al contexto propietario lo vuelve a crear antes de registrar `BindTree`.
  Un caso mínimo deja `items, tick, tick, attrs, attrs` y cambiar `attrs.title`
  llama dos veces al watcher. Con 500 botones provoca 1.000 solicitudes de
  actualización que la cola reduce a 500 ejecuciones. Corregir el registro no
  requiere eliminar contextos ni cambiar la herencia. Falta una regresión y
  validar vistas solapadas/destrucción antes de integrarlo.
- **No concentrar el esfuerzo en el texto aislado.** En este perfil, el 86 %
  del tiempo de cambiar solo los 500 textos aparece en la lectura que fuerza
  layout. El margen en cálculos o colas de GTPL es bastante menor que el de
  `g-attr`. Es una observación de esta fixture, no una proporción universal.

## Resultados de los experimentos

Primero se usó una fixture de diagnóstico con generadores `GCode`, contadores
separados del cronómetro y perfiles CDP a 100 µs. Los perfiles excluyen resets y
validaciones mediante ventanas temporales. Sus porcentajes inclusivos se solapan.
Después se contrastaron los cambios con el **runner original, sus generadores
AOT reales y bundles minificados**, sin contadores ni profiler.

La confirmación usa siete pares, orden alterno, página nueva por variante y
validación completa de salida y limpieza. Tanto referencia como candidato se
empaquetan como módulos autónomos para controlar esa diferencia; por eso sus
tiempos absolutos no sustituyen los de la comparación general con otras librerías.

| Cambio aislado y operación | Referencia ms | Experimento ms | Reducción mediana por par | Rango entre pares |
|---|---:|---:|---:|---:|
| Clasificación diferida: actualizar lista | 21,50 | 18,80 | 11,8 % | 7,7 a 16,2 % |
| Clasificación diferida: añadir | 18,50 | 18,50 | 2,7 % | −4,3 a 25,4 % |
| Clasificación diferida: reducir lista | 14,30 | 11,40 | 20,8 % | 17,0 a 23,3 % |
| Clasificación diferida: invertir | 20,00 | 20,70 | −1,5 % | −9,3 a 13,0 % |
| Clasificación diferida: sustituir IDs | 21,20 | 20,40 | 3,8 % | −8,4 a 8,9 % |
| Enumeración de claves crudas: atributos y texto | 16,05 | 12,90 | 19,9 % | 16,8 a 28,0 % |

La mediana de cocientes emparejados no tiene por qué coincidir exactamente con el
cociente de las dos medianas. Los rangos no son intervalos de confianza.

El diagnóstico calentado, con siete pares de páginas y veinte operaciones
medidas por página tras diez de calentamiento, encontró ~19 % en atributos y
texto, y ~41 % cambiando únicamente `title`. En listas fue mucho más modesto:
~3 % al actualizar y sin mejora consistente al añadir/quitar. El estado de
calentamiento, generador y carga importan; no se promete que una aplicación
obtenga las ganancias del runner original. Añadir, invertir y sustituir no
tienen una mejora consistente demostrada con la clasificación diferida.

## Orden recomendado y condiciones de aceptación

1. Enumeración de claves de `g-attr`: cambio pequeño y mejora consistente en los
   dos experimentos, manteniendo el modelo actual.
2. Clasificación diferida en listas: resultado prometedor en el runner real;
   medir también el primer cambio parcial tras una sustitución y las ráfagas mixtas.
3. Corregir el doble registro heredado, con pruebas de watchers y vistas solapadas.
4. Reconexión de suscripciones por fila y cambios parciales de `g-attr`: siguientes
   investigaciones, sin atribuirles todavía un porcentaje de mejora.

Antes de integrar: conservar igualdad de salida, identidad de contextos y nodos
por posición, eventos de watchers, referencias crudas, getters, filtros/pipes,
aliases compartidos, cancelación asíncrona, `ready()` y destrucción completa.
La suite existente es una base, no sustituye las regresiones específicas de cada
optimización. No se ha modificado el runtime principal en este análisis.

Los dos cambios experimentales juntos pasan las **155 pruebas existentes del
núcleo** en una copia temporal. La confirmación con el runner original terminó
con **28 muestras válidas** (dos casos × dos variantes × siete pares), todas con
salida y limpieza verificadas. El registro heredado duplicado solo se diagnosticó;
no se incluyó una corrección de ese comportamiento en estas pruebas.

## Evidencia y reproducción

- [Contadores, muestras calentadas y relojes de los perfiles](update-analysis/results.json).
- [Resumen de los perfiles y pares](update-analysis/summary.json).
- [Confirmación con el runner original y caso de registro heredado](update-analysis/confirmation.json).
- Los ocho archivos `.cpuprofile` de `update-analysis/` se pueden cargar en Chrome DevTools.
- Scripts: `scripts/benchmarks/update-analysis.mjs`, `summarize-update-analysis.py`
  y `confirm-update-experiments.mjs`. El último requiere los adaptadores preparados
  por `scripts/benchmarks/build.mjs`. Las variantes se construyen en memoria;
  los scripts no reescriben `src`.

```sh
PLAYWRIGHT_MODULE=/ruta/playwright/index.mjs node scripts/benchmarks/update-analysis.mjs
python scripts/benchmarks/summarize-update-analysis.py
PLAYWRIGHT_MODULE=/ruta/playwright/index.mjs node scripts/benchmarks/confirm-update-experiments.mjs
```
