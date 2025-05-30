# Proyecto de Comparación de Rendimiento de Frameworks Frontend

Este proyecto implementa la misma aplicación web ("Lista de Tareas Dinámica") utilizando diferentes tecnologías frontend con el objetivo de analizar y comparar su rendimiento, específicamente en términos de consumo de RAM y tiempo de renderizado.

## Aplicaciones Implementadas

Actualmente, la "Lista de Tareas Dinámica" se ha implementado en:

1.  **Vue.js**: (`performance/vue-app`)
2.  **React**: (`performance/react-app`)
3.  **GTPL (Simulación)**: (`performance/gtpl-app`)

### Funcionalidades de la Aplicación "Lista de Tareas Dinámica"

Cada implementación incluye:
*   Visualización de una lista de tareas (50 tareas iniciales).
*   Adición de nuevas tareas.
*   Marcar/desmarcar tareas como completadas.
*   Eliminación de tareas.
*   Filtros por estado (todas, completadas, incompletas) y prioridad (todas, alta, media, baja).
*   Contadores de tareas (total, completadas, incompletas).

## Nota Importante sobre Angular

Se intentó incluir una versión de Angular en esta comparación. Sin embargo, la implementación no fue posible debido a las siguientes limitaciones del entorno de ejecución:
*   La versión de Node.js disponible (v18.19.1) es incompatible con la versión más reciente de Angular CLI (que requiere Node.js v20.11.0 o superior).
*   No fue posible actualizar la versión de Node.js en el entorno.
*   La configuración manual de un proyecto Angular sin CLI se consideró demasiado compleja y propensa a errores para este entorno.

Por lo tanto, la comparación actual se limita a Vue.js, React y la simulación de GTPL.

## Cómo Ejecutar las Aplicaciones

Para todas las aplicaciones, simplemente abre el archivo `index.html` correspondiente en un navegador web.

*   **Vue.js**: Abrir `performance/vue-app/index.html`
*   **React**: Abrir `performance/react-app/index.html`
*   **GTPL (Simulación)**: Abrir `performance/gtpl-app/index.html`

## Análisis de Rendimiento

Se recomienda utilizar las herramientas de desarrollo de tu navegador para analizar el rendimiento:

1.  **Consumo de RAM:**
    *   **Chrome/Edge:** Abrir DevTools (F12), ir a la pestaña "Memory". Tomar un "Heap snapshot" después de que la página cargue y después de interactuar con la aplicación (añadir, eliminar, filtrar tareas). Observar el tamaño del heap.
    *   **Firefox:** Abrir DevTools (F12), ir a la pestaña "Memory". Usar la herramienta de "Snapshots".

2.  **Tiempo de Renderizado y Scripting:**
    *   **Chrome/Edge/Firefox:** Abrir DevTools (F12), ir a la pestaña "Performance".
    *   Grabar un perfil mientras la página carga inicialmente.
    *   Grabar perfiles mientras se realizan operaciones clave (añadir varias tareas, aplicar filtros a una lista grande, eliminar tareas).
    *   Analizar el "Summary" (火焰图 - flame graph) para ver el tiempo empleado en "Scripting", "Rendering" y "Painting". Prestar atención a operaciones largas o bloqueos de UI.

### Consideraciones para la Comparación

*   Asegúrate de realizar las mediciones en condiciones similares (p.ej., mismo navegador, sin otras pestañas/aplicaciones pesadas abiertas).
*   Repite las mediciones varias veces para obtener promedios y descartar valores atípicos.
*   Observa tanto el rendimiento inicial de carga como el rendimiento durante la interacción con la aplicación.
