export const METHODS = {
  switch: {
    title: "Switch · memoria de ramas grandes",
    goal: "Memoria como objetivo principal. Muchas ramas declaradas, ninguna visitada y una única vista activa. El recorrido por otras ramas es opcional.",
    primary: [
      "definitionBytes",
      "activationBytes",
      "activeBytes",
      "activeElements",
      "inertElements",
      "constructedBlocks",
    ],
    secondary: ["mountMs", "showMs", "retainedBytes"],
    size: false,
  },
  for: {
    title: "For · operaciones sobre listas",
    goal: "Comparar la directiva de lista y su equivalente: actualizar, añadir, quitar, invertir y reemplazar, con el resultado completo validado.",
    primary: [
      "updateMs",
      "appendMs",
      "removeMs",
      "reverseMs",
      "replaceMs",
      "activeBytes",
    ],
    secondary: ["mountMs", "activeElements"],
    size: true,
  },
  if: {
    title: "If · crear, ocultar y volver",
    goal: "Medir primera construcción, retirada y reentrada de un árbol grande. La memoria tras ocultarlo permite observar cachés y retención.",
    primary: [
      "showMs",
      "hideMs",
      "revisitMs",
      "activationBytes",
      "retainedBytes",
      "activeElements",
    ],
    secondary: ["mountMs", "activeBytes"],
    size: false,
  },
  styles: {
    title: "Estilos en línea",
    goal: "Cambiar color, fondo y anchura sobre los mismos elementos, sin reconstruir la vista.",
    primary: ["updateMs", "fps", "frameP95Ms", "activeBytes", "activeElements"],
    secondary: ["mountMs"],
    size: true,
  },
  classes: {
    title: "Clases CSS",
    goal: "Alternar clases CSS sobre los mismos elementos y medir su actualización y layout.",
    primary: ["updateMs", "fps", "frameP95Ms", "activeBytes", "activeElements"],
    secondary: ["mountMs"],
    size: true,
  },
  attributes: {
    title: "Atributos y texto",
    goal: "Actualizar title, data-state, aria-label y texto, manteniendo el mismo árbol.",
    primary: ["updateMs", "fps", "frameP95Ms", "activeBytes", "activeElements"],
    secondary: ["mountMs"],
    size: true,
  },
  forms: {
    title: "Formulario · enlace bidireccional",
    goal: "Escribir mediante un evento input real y comprobar la propagación al modelo, a los demás campos y al output.",
    primary: ["inputMs", "fps", "frameP95Ms", "activeBytes", "activeElements"],
    secondary: ["mountMs"],
    size: true,
  },
  grid: {
    title: "Grid · celdas independientes",
    goal: "Aumentar X e Y y aplicar el mismo lote aleatorio por requestAnimationFrame. Se comparan FPS, pausas y actualizaciones por segundo.",
    primary: [],
    secondary: [],
    size: false,
  },
};
const m = (key, title, unit, direction, note, kind = "time") => ({
  key,
  title,
  unit,
  direction,
  note,
  kind,
});
export const methodMetrics = [
  m(
    "definitionBytes",
    "Definiciones, sin vista",
    "MiB",
    "none",
    "Diferencia del entorno JS+DOM frente al ejecutor vacío: incluye runtime, código, plantillas y su representación inerte.",
    "memory",
  ),
  m(
    "activationBytes",
    "Coste de activar una rama",
    "MiB",
    "none",
    "Diferencia entre una rama activa y todas las ramas declaradas sin vista. Estimación experimental.",
    "memory",
  ),
  m(
    "activeBytes",
    "Definiciones + vista activa",
    "MiB",
    "none",
    "Diferencia JS+DOM del entorno frente al ejecutor vacío. No es la RAM total del proceso ni memoria exclusiva del framework.",
    "memory",
  ),
  m(
    "retainedBytes",
    "Tras ocultar o visitar ramas",
    "MiB",
    "none",
    "Diferencia respecto al estado inicial sin vista, después de retirar contenido. Puede incluir cachés y variación del GC.",
    "memory",
  ),
  m(
    "activeElements",
    "Elementos conectados",
    "elementos",
    "none",
    "Elementos presentes en la vista medida; se cuentan también los wrappers propios del motor.",
    "count",
  ),
  m(
    "inertElements",
    "Elementos de plantillas inertes",
    "elementos",
    "none",
    "Contenido de template.content antes de activar una rama. No aparece conectado, pero sus nodos existen.",
    "count",
  ),
  m(
    "constructedBlocks",
    "Bloques de la rama elegida",
    "bloques",
    "none",
    "Bloques grandes conectados al activar únicamente la rama elegida; la salida esperada es 128.",
    "count",
  ),
  m(
    "mountMs",
    "Montaje inicial",
    "ms",
    "lower",
    "Arranque hasta DOM confirmado y layout. Importación y descarga excluidas.",
  ),
  m(
    "showMs",
    "Primera construcción",
    "ms",
    "lower",
    "Tiempo secundario: activar la vista pesada por primera vez.",
  ),
  m(
    "hideMs",
    "Retirar la vista",
    "ms",
    "lower",
    "Retirar la vista del DOM; cada motor gestiona la destrucción o caché de sus instancias.",
  ),
  m(
    "revisitMs",
    "Volver a mostrar",
    "ms",
    "lower",
    "Volver a la misma vista después de retirarla.",
  ),
  m(
    "updateMs",
    "Actualizar valores",
    "ms",
    "lower",
    "Mediana de actualizaciones equivalentes con DOM y layout confirmados.",
  ),
  m(
    "appendMs",
    "Añadir un 25 %",
    "ms",
    "lower",
    "Añadir elementos al final de una lista existente.",
  ),
  m(
    "removeMs",
    "Quitar la mitad",
    "ms",
    "lower",
    "Retirar la mitad de una lista existente.",
  ),
  m(
    "reverseMs",
    "Invertir el orden",
    "ms",
    "lower",
    "Invertir una lista. React, Svelte, Vue y Angular conservan claves; GTPL usa su directiva nativa.",
  ),
  m(
    "replaceMs",
    "Reemplazar la lista",
    "ms",
    "lower",
    "Sustituir todos los elementos por nuevos identificadores.",
  ),
  m(
    "inputMs",
    "Input → modelo → vista",
    "ms",
    "lower",
    "Evento input nativo y propagación completa por el enlace bidireccional.",
  ),
  m(
    "fps",
    "Cadencia bajo cambios",
    "fps",
    "higher",
    "Cadencia de requestAnimationFrame con actualizaciones confirmadas, limitada por la pantalla.",
  ),
  m(
    "frameP95Ms",
    "Intervalo de frame p95",
    "ms",
    "lower",
    "Percentil 95 de los intervalos de rAF de cada muestra.",
  ),
  m(
    "refreshMs",
    "Intervalo en reposo",
    "ms",
    "none",
    "Cadencia de referencia sin cambios.",
    "count",
  ),
];
export function selectedMetrics(method, secondary = false) {
  const spec = METHODS[method];
  const keys = secondary ? [...spec.primary, ...spec.secondary] : spec.primary;
  return keys.map((key) => methodMetrics.find((metric) => metric.key === key));
}
export function methodKey(method, cases = 32) {
  if (!(method in METHODS) || method === "grid")
    throw new Error("Caso programático inválido.");
  if (method === "switch" && ![8, 32, 64].includes(cases))
    throw new Error("Número de ramas inválido.");
  return method === "switch" ? `switch-${cases}` : method;
}
