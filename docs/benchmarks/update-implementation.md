# Integración de mejoras de listas y atributos

4 de noviembre de 2026. Comparación contra `81efcb65abce80ca25078d37a6e5f01427d8e32c`.
Se conservan los contextos por fila, la herencia, la reconciliación por posición,
los proxies y la API pública. No se incorpora `g-key`.

## Implementación final

- **Reasignaciones de filas:** se conservan temporalmente los contenedores del
  índice de suscripciones de la propiedad. Las suscripciones y targets antiguos
  se eliminan y los proxies se revocan normalmente; los nuevos datos reutilizan
  el índice vacío. Los índices de descendientes antiguos se eliminan. La retención
  se libera incluso ante errores, valores estáticos o una sustitución reentrante.
- **`g-attr`:** las claves se enumeran sobre `toRaw(result)`, evitando las trampas
  de enumeración y descriptores. Los valores se siguen leyendo en `result`, por
  lo que los getters conservan el receiver reactivo. Se mantiene la comprobación
  del DOM real y la retirada de atributos ausentes.
- **Bindings heredados:** la propiedad reactiva se registra únicamente al llegar
  a su contexto propietario. Desaparecen el descriptor duplicado, la suscripción
  duplicada y los dos avisos al watcher por un único cambio.

La clasificación de datos ordinarios **se conserva al montar, sustituir y
refrescar una lista**. La variante diferida del diagnóstico no se integra:
en el ensayo ampliado desplazaba hasta unos 24 ms a la primera edición parcial
de una lista recién sustituida de 10.000 filas. La implementación final evita
ese desplazamiento de trabajo. Tampoco introduce una caché de resultados de
getters ni omite filas únicamente porque conserven su referencia.

## Rendimiento medido de esta implementación

Siete pares de páginas nuevas, orden alterno, Chrome 156 en el mismo equipo de la
comparación general. Se usan los generadores AOT preparados del proyecto y su
runner sin modificar. Referencia y candidato se empaquetan del mismo modo,
como módulos ESM autónomos minificados. Compilación y descarga quedan fuera del
cronómetro; las operaciones incluyen confirmación DOM y layout.

| Operación | Referencia ms | Implementación ms | Reducción mediana por par | Rango entre pares |
|---|---:|---:|---:|---:|
| Actualizar 500 filas | 20,80 | 19,80 | 3,4 % | 1,9 a 13,5 % |
| Añadir 125 filas | 19,00 | 18,40 | 1,6 % | −2,7 a 7,1 % |
| Reducir de 500 a 250 | 14,20 | 14,20 | −2,8 % | −6,3 a 4,8 % |
| Invertir 500 filas | 19,60 | 20,00 | −3,1 % | −4,6 a 4,1 % |
| Sustituir IDs de 500 filas | 22,00 | 21,00 | 2,7 % | −0,5 a 8,5 % |
| Atributos y texto, 500 botones | 16,00 | 12,90 | 19,0 % | 17,4 a 21,6 % |

La mejora más clara es la de atributos. Las diferencias de añadir, reducir,
invertir y sustituir son pequeñas y sus rangos atraviesan cero: no se presentan
como mejoras consistentes. La mediana de cocientes emparejados no coincide
necesariamente con el cociente de medianas. Los rangos no son intervalos de
confianza. Estos datos no sustituyen la clasificación general entre librerías,
que utiliza otros casos y ponderaciones.

El diagnóstico complementario cambia una única fila de listas de 1.000 y 10.000
elementos, tanto después del montaje como de una sustitución completa. Mide
finalización JavaScript, sin layout, y verifica todos los textos y un solo aviso
al watcher. En 10.000 filas, la primera edición después de sustituir el array
tiene una mediana de **0,20 ms en ambas versiones**. Las siguientes se mantienen
en el orden de la resolución del reloj, sin un recorrido diferido de toda la lista.

## Regresiones y consumidores

Las nuevas pruebas cubren registro heredado a través de varios ancestros,
watchers, propietarios compartidos, revocación, restauración del descriptor,
getters de atributos, claves heredadas y no enumerables, borrados, cambios crudos,
ediciones externas del DOM, identidad de contextos y nodos, primer cambio parcial,
transiciones entre objetos y valores estáticos, errores y sustitución reentrante.

GTPLWeb y Sanmateo se comprueban en copias aisladas de sus fuentes actuales,
incluidos los cambios locales, resolviendo `@mpeliz/gtpl` al paquete reconstruido
de este proyecto. No se cambian sus dependencias instaladas originales.

| Gate final | Resultado |
|---|---|
| Núcleo GTPL | 162 pruebas, cero fallos |
| Herramientas y laboratorio | 131 pruebas, cero fallos |
| GTPLWeb | 51 pruebas, cero fallos; builds y typecheck correctos |
| Cliente Sanmateo, Node | 169 pruebas, cero fallos |
| Sanmateo, DOM | Listas 191 → 12, reemplazo, iteración, ready/destroy y selects dinámicos correctos |
| Sanmateo, navegador | Bundle de sitio sintético; Agenda, Compras, Gastronomía y navegación correctos |
| Paquete GTPL | Build, TypeScript y comprobaciones ESM/CJS/runtime correctos |

Son **513 pruebas Node**, más los gates de DOM, navegador, tipos y paquete.

La suite ampliada de Sanmateo descubrió dos fallos previos en la prueba de
snapshots de patrocinios: al extraer `AgendaPage` y eliminar sus imports, la VM
no recibía `LatestQuery`. Se reprodujeron también en el proyecto original y se
corrigió la fixture importando y proporcionando la clase real. Las aserciones y
el código de la aplicación se mantienen.

Los resultados finales de los gates y los hashes de las fuentes y paquetes
validados se conservan en [validation.json](update-implementation/validation.json).

## Datos y reproducción

[Muestras completas, resultados de listas parciales y hashes](update-implementation/results.json).

Preparar una copia de la revisión de referencia con las dependencias del
laboratorio y ejecutar allí `npm run build` y `node scripts/benchmarks/build.mjs`.
Desde el checkout candidato:

```sh
BASELINE_ROOT=/ruta/referencia \
PLAYWRIGHT_MODULE=/ruta/playwright/index.mjs \
OUTPUT=artifacts/update-implementation SAMPLES=7 \
node scripts/benchmarks/compare-updates.mjs
```

El script construye ambas variantes sin modificar sus fuentes. Registra 28
muestras del runner y 14 páginas adicionales del diagnóstico de listas, cada
una con ocho operaciones comprobadas. Las mediciones se ejecutan sin builds,
tests ni otros navegadores de validación en paralelo.
