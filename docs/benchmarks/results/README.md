# Comparación por aspectos

Medición: 2026-11-04T16:09:09.242Z. Chrome 156.0.8078.79 headless; Intel(R) Core(TM) i5-2400S CPU @ 2.50GHz.

570 muestras validadas, 0 errores. 5 muestras de tiempo y 3 de memoria por motor/caso. Medianas; las diferencias con rangos solapados no demuestran una ventaja estable.

Puesto entre GTPL AOT, React, Svelte, Vue, Angular y Alpine. Vanilla y GTPL JIT aparecen en la tabla completa. Flutter se mide solo en grid, con su build original.

| Aspecto | GTPL AOT | Puesto / 6 | Mejor mediana entre los seis | Rangos solapados con GTPL |
| --- | ---: | ---: | --- | --- |
| Memoria · 64 vistas, una activa | 0,46 MiB | 1 | GTPL AOT · 0,46 MiB | — |
| Editar una fila de 500 | 0,63 ms | 3 | Alpine · 0,53 ms | Alpine, Svelte |
| Editar 50 filas de 500 | 2,95 ms | 2 | Angular · 2,85 ms | Angular, Svelte, React |
| Montar 500 filas | 69,61 ms | 5 | Vue · 40,82 ms | — |
| Actualizar las 500 filas (objetos nuevos) | 14,57 ms | 5 | Angular · 9,73 ms | Svelte |
| Añadir 125 filas + renovar objetos existentes | 16,04 ms | 5 | Angular · 5,89 ms | Svelte |
| Quitar la mitad + actualizar valores | 12,48 ms | 5 | Angular · 5,05 ms | — |
| Invertir lista + actualizar valores | 20,09 ms | 4 | Vue · 19,04 ms | Vue, React, Angular |
| Reemplazar 500 filas con nuevos IDs | 18,77 ms | 1 | GTPL AOT · 18,77 ms | Vue |
| Crear una vista de 128 bloques | 44,2 ms | 4 | Svelte · 35,65 ms | Vue, React, Angular |
| Retirar la vista | 1,64 ms | 1 | GTPL AOT · 1,64 ms | — |
| Volver a mostrar la vista | 25,21 ms | 1 | GTPL AOT · 25,21 ms | — |
| Cambiar estilos · 500 elementos | 12,68 ms | 4 | Angular · 9,82 ms | — |
| Cambiar clases · 500 elementos | 10,35 ms | 3 | React · 9,78 ms | React, Svelte, Vue |
| Cambiar atributos y texto · 500 elementos | 13,05 ms | 3 | Angular · 10,2 ms | — |
| Propagar un input · 500 elementos | 15,07 ms | 4 | Angular · 11,8 ms | React, Vue |
| Memoria · 8 vistas, una activa | 0,42 MiB | 1 | GTPL AOT · 0,42 MiB | — |
| Memoria · 32 vistas, una activa | 0,43 MiB | 1 | GTPL AOT · 0,43 MiB | — |
| Memoria · lista de 500 filas | 2,32 MiB | 5 | Angular · 1,59 MiB | — |
| Memoria · vista de 128 bloques | 0,39 MiB | 2 | Svelte · 0,24 MiB | — |
| Descarga · caso de listas | 13,44 KiB gzip | 1 | GTPL AOT · 13,44 KiB gzip | — |
| Descarga · caso de 64 vistas | 116,76 KiB gzip | 3 | Alpine · 101,24 KiB gzip | — |
| Fluidez · grid 64 × 64 · cambia el 100 % | 4,12 FPS | 4 | React · 4,36 FPS | React, Angular, Svelte |
| Fluidez · grid 64 × 64 · cambia el 10 % | 16,44 FPS | 2 | Svelte · 16,55 FPS | Svelte, React, Angular |

## Todas las medianas

| Aspecto | GTPL AOT | GTPL JIT | React | Svelte | Vue | Angular | Alpine | Vanilla JS | Flutter Web |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Memoria · 64 vistas, una activa (MiB) | 0,46 | 11 | 5,6 | 3,04 | 10,1 | 2,67 | 2,94 | 2,91 | — |
| Editar una fila de 500 (ms) | 0,63 | 0,63 | 1,09 | 0,6 | 2,25 | 0,76 | 0,53 | 0,53 | — |
| Editar 50 filas de 500 (ms) | 2,95 | 3,08 | 2,98 | 2,98 | 4,55 | 2,85 | 3,67 | 2,24 | — |
| Montar 500 filas (ms) | 69,61 | 71,57 | 48,08 | 60,27 | 40,82 | 56,91 | 148,54 | 36,8 | — |
| Actualizar las 500 filas (objetos nuevos) (ms) | 14,57 | 14,58 | 10,29 | 13,63 | 11,31 | 9,73 | 36,7 | 16,56 | — |
| Añadir 125 filas + renovar objetos existentes (ms) | 16,04 | 16,03 | 7,43 | 14,03 | 9,78 | 5,89 | 60,73 | 23,77 | — |
| Quitar la mitad + actualizar valores (ms) | 12,48 | 12,38 | 6,57 | 7,45 | 5,82 | 5,05 | 19,01 | 8,7 | — |
| Invertir lista + actualizar valores (ms) | 20,09 | 20,11 | 19,74 | 33,74 | 19,04 | 20,02 | 35,11 | 14,34 | — |
| Reemplazar 500 filas con nuevos IDs (ms) | 18,77 | 19,74 | 23,05 | 27,77 | 19,52 | 22,89 | 78,06 | 21,43 | — |
| Crear una vista de 128 bloques (ms) | 44,2 | 44,6 | 42,19 | 35,65 | 41,09 | 48,28 | 53,89 | 30,44 | — |
| Retirar la vista (ms) | 1,64 | 1,67 | 4,9 | 2,03 | 1,84 | 2,28 | 4,62 | 1,38 | — |
| Volver a mostrar la vista (ms) | 25,21 | 24,93 | 36,42 | 26,53 | 30,79 | 29,27 | 37,57 | 27,37 | — |
| Cambiar estilos · 500 elementos (ms) | 12,68 | 12,89 | 10,05 | 11,05 | 16,09 | 9,82 | 34,7 | 9,14 | — |
| Cambiar clases · 500 elementos (ms) | 10,35 | 10,36 | 9,78 | 9,95 | 10,57 | 11,01 | 18,54 | 8,69 | — |
| Cambiar atributos y texto · 500 elementos (ms) | 13,05 | 13,07 | 11 | 17,22 | 16,52 | 10,2 | 37,41 | 10,86 | — |
| Propagar un input · 500 elementos (ms) | 15,07 | 15 | 14,87 | 13,25 | 15,32 | 11,8 | 21,03 | 12,09 | — |
| Memoria · 8 vistas, una activa (MiB) | 0,42 | 1,87 | 1,32 | 0,55 | 1,62 | 1,55 | 1 | 0,39 | — |
| Memoria · 32 vistas, una activa (MiB) | 0,43 | 5,78 | 3,05 | 1,62 | 5,21 | 2,03 | 1,62 | 1,47 | — |
| Memoria · lista de 500 filas (MiB) | 2,32 | 2,4 | 1,65 | 1,67 | 1,69 | 1,59 | 5,47 | 0,29 | — |
| Memoria · vista de 128 bloques (MiB) | 0,39 | 0,71 | 0,83 | 0,24 | 0,7 | 1,4 | 0,68 | 0,08 | — |
| Descarga · caso de listas (KiB gzip) | 13,44 | 19,01 | 68,29 | 24,95 | 23,75 | 99,21 | 20,52 | 1,27 | — |
| Descarga · caso de 64 vistas (KiB gzip) | 116,76 | 97,21 | 178,11 | 113,91 | 351,63 | 523,13 | 101,24 | 78,77 | — |
| Fluidez · grid 64 × 64 · cambia el 100 % (FPS) | 4,12 | 4,19 | 4,36 | 4,2 | 3,74 | 4,33 | 2,75 | 4,09 | 1,21 |
| Fluidez · grid 64 × 64 · cambia el 10 % (FPS) | 16,44 | 16,04 | 16,44 | 16,55 | 15,55 | 16,29 | 13,51 | 16,35 | 3,51 |

## Alcance

- Ediciones locales: cambia texto y valor de 1 o 50 filas, preservando objetos no modificados. React usa filas inmutables y memo; los demás, su estado reactivo nativo.
- Se conservan las pruebas con arrays nuevos: añadir también renueva los objetos existentes; quitar e invertir también cambian valores. No son mutaciones locales.
- Tiempo: DOM confirmado y lectura de layout. Descarga/importación excluidas; la compilación JIT sí entra en el montaje. Validación completa fuera del reloj.
- Memoria: delta de heap V8 tras GC, incluye código y objetos; excluye memoria nativa del DOM y RAM total. El HTML inerte de Alpine no queda representado completamente en este número.
- Descarga: entrada y dependencias compartidas del caso en gzip, incluida su plantilla. No es tamaño mínimo de librería.
- Grid: 5 s por nivel, mismas semillas/celdas/cambios. Flutter incluye espera al frame y envío del render; DOM termina tras cambios y layout, antes de pintar. No comparar estos tiempos como costes CPU equivalentes.
- Las barras usan índices por prueba (100 = mejor). No se calcula una clasificación global.

### Frames observados en grid 64 × 64

| Motor | Mínimo de frames al 100 % | Mínimo al 10 % |
| --- | ---: | ---: |
| GTPL AOT | 21 | 82 |
| GTPL JIT | 21 | 77 |
| React | 21 | 81 |
| Svelte | 21 | 80 |
| Vue | 18 | 76 |
| Angular | 21 | 80 |
| Alpine | 14 | 67 |
| Vanilla JS | 21 | 81 |
| Flutter Web | 6 (cadencia poco estable) | 17 |

GTPL source SHA256: `d2ae00a0ce5a34e1a1c18e0abb3d79691c5857d45b12f6b7719af1a6da429d46`.

GTPL figuraba como 3.0.0 al medir. La versión 3.1.0 conserva exactamente las mismas fuentes, opciones, ejecutores y bytes de los bundles medidos (SHA-256 verificados). Las muestras originales no se modifican.

Versiones: GTPL AOT 3.1.0; GTPL JIT 3.1.0; React 19.3.1; Svelte 5.57.3; Vue 3.5.44; Angular 22.2.3; Alpine 3.17.5; Vanilla JS DOM API; Flutter Web 3.47.8.

[Resumen y rangos](latest.json) · [Todas las muestras DOM](raw.json) · [Muestras Flutter](flutter-raw.json) · [Reproducir](../README.md)
