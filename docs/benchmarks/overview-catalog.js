// Each entry is one measured question. No weighted overall winner.
const metric = (id, group, es, en, test, key, unit = 'ms', extra = {}) =>
  ({ id, group, title: { es, en }, test, key, unit, direction: 'lower', phase: 'timing', ...extra });
export const overviewMetrics = [
  metric('heap-switch-64', 'memory', 'Memoria · 64 vistas, una activa', 'Memory · 64 views, one active', 'switch-64', 'activeBytes', 'MiB', { phase: 'heap' }),
  metric('edit-one', 'lists', 'Editar una fila de 500', 'Edit one of 500 rows', 'for-500', 'editOneMs'),
  metric('edit-tenth', 'lists', 'Editar 50 filas de 500', 'Edit 50 of 500 rows', 'for-500', 'editTenthMs'),
  metric('list-mount', 'lists', 'Montar 500 filas', 'Mount 500 rows', 'for-500', 'mountMs'),
  metric('list-update', 'lists', 'Actualizar las 500 filas (objetos nuevos)', 'Update all 500 rows (new objects)', 'for-500', 'updateMs'),
  metric('list-append', 'lists', 'Añadir 125 filas + renovar objetos existentes', 'Append 125 rows + recreate existing objects', 'for-500', 'appendMs'),
  metric('list-remove', 'lists', 'Quitar la mitad + actualizar valores', 'Remove half + update values', 'for-500', 'removeMs'),
  metric('list-reverse', 'lists', 'Invertir lista + actualizar valores', 'Reverse list + update values', 'for-500', 'reverseMs'),
  metric('list-replace', 'lists', 'Reemplazar 500 filas con nuevos IDs', 'Replace 500 rows with new IDs', 'for-500', 'replaceMs'),
  metric('view-show', 'views', 'Crear una vista de 128 bloques', 'Create a 128-block view', 'if', 'showMs'),
  metric('view-hide', 'views', 'Retirar la vista', 'Remove the view', 'if', 'hideMs'),
  metric('view-revisit', 'views', 'Volver a mostrar la vista', 'Show the view again', 'if', 'revisitMs'),
  ...[['styles', 'Cambiar estilos', 'Change styles'], ['classes', 'Cambiar clases', 'Change classes'], ['attributes', 'Cambiar atributos y texto', 'Change attributes and text'], ['forms', 'Propagar un input', 'Propagate an input']].map(([id, es, en]) =>
    metric(id, 'ui', `${es} · 500 elementos`, `${en} · 500 elements`, id, id === 'forms' ? 'inputMs' : 'updateMs')),
  ...[8, 32].map(n => metric(`heap-switch-${n}`, 'memory', `Memoria · ${n} vistas, una activa`, `Memory · ${n} views, one active`, `switch-${n}`, 'activeBytes', 'MiB', { phase: 'heap' })),
  metric('heap-list', 'memory', 'Memoria · lista de 500 filas', 'Memory · 500-row list', 'for-500', 'activeBytes', 'MiB', { phase: 'heap' }),
  metric('heap-view', 'memory', 'Memoria · vista de 128 bloques', 'Memory · 128-block view', 'if', 'activeBytes', 'MiB', { phase: 'heap' }),
  metric('download-list', 'download', 'Descarga · caso de listas', 'Download · list case', 'for', 'gzipBytes', 'KiB gzip', { phase: 'bundle' }),
  metric('download-switch', 'download', 'Descarga · caso de 64 vistas', 'Download · 64-view case', 'switch-64', 'gzipBytes', 'KiB gzip', { phase: 'bundle' }),
  metric('grid-full', 'grid', 'Fluidez · grid 64 × 64 · cambia el 100 %', 'Smoothness · 64 × 64 grid · 100% changed', 'grid', 'fps', 'FPS', { direction: 'higher', percent: 100 }),
  metric('grid-tenth', 'grid', 'Fluidez · grid 64 × 64 · cambia el 10 %', 'Smoothness · 64 × 64 grid · 10% changed', 'grid', 'fps', 'FPS', { direction: 'higher', percent: 10 }),
];
export const productionEngines = ['gtpl', 'react', 'svelte', 'vue', 'angular', 'alpine'];
export const engineNames = { gtpl: 'GTPL AOT', 'gtpl-jit': 'GTPL JIT', react: 'React', svelte: 'Svelte', vue: 'Vue', angular: 'Angular', alpine: 'Alpine', vanilla: 'Vanilla JS', flutter: 'Flutter Web' };
