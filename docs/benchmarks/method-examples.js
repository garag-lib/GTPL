const block =
  '<article class="bench-block">\n  <h4>Panel grande</h4>\n  <p>Contenido propio de esta rama…</p>\n  <span>{{tick}}</span>\n  <!-- Más bloques HTML, sin for compartido -->\n</article>';
function ifSequence(engine) {
  const assign = {
    gtpl: (value) => `state.visible = ${value};`,
    react: (value) => `setVisible(${value});`,
    vue: (value) => `visible.value = ${value};`,
    angular: (value) => `this.visible = ${value};`,
    alpine: (value) => `state.visible = ${value};`,
    vanilla: (value) => `visible = ${value}; render();`,
  }[engine];
  return (
    "// Inicialmente oculto. Cada línea es una fase separada.\n// El ejecutor confirma el DOM antes de pasar a la siguiente.\n" +
    [
      [true, "Primera creación"],
      [false, "Retirar"],
      [true, "Volver a mostrar"],
      [false, "Retirada final y lectura de memoria"],
    ]
      .map(([value, label]) => `${assign(value)} // ${label}`)
      .join("\n")
  );
}
export function methodExample(method, id, cases = 32) {
  const engine = id === "gtpl-jit" ? "gtpl" : id;
  const memory =
    method === "switch"
      ? `En el experimento hay ${cases} ramas explícitas, cada una con 128 bloques HTML. Este extracto muestra dos ramas. Las definiciones permanecen cargadas; se mide qué instancias y nodos se construyen.`
      : method === "if"
        ? "La misma secuencia en todos los motores: false → true → false → true → false. Entre fases, el ejecutor espera el DOM, solicita layout y valida la vista. Los tiempos miden primera creación, retirada y reentrada; la última retirada permite leer memoria. Las líneas mostradas representan fases separadas."
        : "Extracto del patrón. El adaptador completo, el arranque y las operaciones medidas están enlazados en las fuentes.";
  let code;
  if (method === "switch")
    code = {
      gtpl: `<div g-switch="active">\n  <section g-case="'0'">\n${block}\n  </section>\n  <section g-case="'1'">\n    <!-- Otro árbol HTML grande -->\n  </section>\n</div>\n\n// Estado inicial: active = null\n// Activar solo la rama elegida:\nstate.active = 0;`,
      react: `function View({ active, tick }) {\n  switch (active) {\n    case 0: return <PanelGrandeA tick={tick} />;\n    case 1: return <PanelGrandeB tick={tick} />;\n    default: return null;\n  }\n}\n\nfunction PanelGrandeA({ tick }) {\n  return <section>\n    <article><h4>Panel grande</h4>\n      <p>Contenido propio…</p><span>{tick}</span>\n    </article>\n    {/* Más bloques HTML explícitos */}\n  </section>;\n}`,
      vue: `<section v-if="active === 0">\n${block}\n</section>\n<section v-else-if="active === 1">\n  <!-- Otro árbol HTML grande -->\n</section>\n\n// const active = ref(null);\nactive.value = 0;`,
      angular: `@switch (active) {\n  @case (0) {\n${block}\n  }\n  @case (1) {\n    <!-- Otro árbol HTML grande -->\n  }\n}\n\n// Estado inicial: active = null\nthis.active = 0;`,
      alpine: `<div x-data="{ active: null, tick: 0 }">\n  <template x-if="active === 0">\n    <section>\n      <article><h4>Panel grande</h4>\n        <p>Contenido propio…</p>\n        <span x-text="tick"></span>\n      </article>\n      <!-- Más bloques HTML explícitos -->\n    </section>\n  </template>\n  <template x-if="active === 1">\n    <section><!-- Otro árbol grande --></section>\n  </template>\n</div>`,
      vanilla: `const paneles = [htmlGrandeA, htmlGrandeB];\nlet active = null;\n\nfunction activate(index) {\n  container.replaceChildren();\n  if (index !== null) {\n    container.innerHTML = paneles[index];\n  }\n  active = index;\n}\nactivate(0);`,
    }[engine];
  if (method === "for")
    code = {
      gtpl: `<article g-for="rows;index;row">\n  <b>{{row.label}}</b><i>{{row.value}}</i>\n</article>\n\nstate.rows = [...state.rows, newRow];\nstate.rows = [...state.rows].reverse();`,
      react: `rows.map(row => (\n  <article key={row.id}>\n    <b>{row.label}</b><i>{row.value}</i>\n  </article>\n))\n\nsetRows(rows => [...rows, newRow]);\nsetRows(rows => [...rows].reverse());`,
      vue: `<article v-for="row in rows" :key="row.id">\n  <b>{{row.label}}</b><i>{{row.value}}</i>\n</article>\n\nrows.value = [...rows.value, newRow];`,
      angular: `@for (row of rows; track row.id) {\n  <article>\n    <b>{{row.label}}</b><i>{{row.value}}</i>\n  </article>\n}\n\nthis.rows = [...this.rows, newRow];`,
      alpine: `<template x-for="row in rows" :key="row.id">\n  <article>\n    <b x-text="row.label"></b>\n    <i x-text="row.value"></i>\n  </article>\n</template>`,
      vanilla: `const nodes = new Map();\nfor (const row of rows) {\n  let node = nodes.get(row.id);\n  if (!node) {\n    node = createRow(row);\n    nodes.set(row.id, node);\n  }\n  updateRow(node, row);\n  container.append(node);\n}\n// Retirar los ids que salieron de la lista.`,
    }[engine];
  if (method === "if")
    code = {
      gtpl: `<section g-if="visible">\n${block}\n</section>`,
      react: `function View({ visible, tick }) {\n  return visible ? (\n    <section>\n${block
        .replaceAll("class=", "className=")
        .replace("{{tick}}", "{tick}")
        .replace(
          /<!-- (.*?) -->/g,
          "{/* $1 */}",
        )}\n    </section>\n  ) : null;\n}`,
      vue: `<section v-if="visible">\n${block}\n</section>`,
      angular: `@if (visible) {\n  <section>\n${block}\n  </section>\n}`,
      alpine: `<template x-if="visible">\n  <section>\n${block.replace("<span>{{tick}}</span>", '<span x-text="tick"></span>')}\n  </section>\n</template>\n\n// Estado reactivo del componente:\nconst state = Alpine.$data(element);`,
      vanilla: `const htmlGrande = \`<section>\n${block.replace("{{tick}}", "__TICK__")}\n</section>\`;\n\nfunction render() {\n  container.innerHTML = visible\n    ? htmlGrande.replaceAll('__TICK__', tick)\n    : '';\n}`,
    }[engine];
  if (method === "if") code += "\n\n" + ifSequence(engine);
  if (method === "styles")
    code = {
      gtpl: `<div g-style="background-color:{{theme.backgroundColor}};
  color:{{theme.color}};width:{{theme.width}}">Caja</div>\n\nstate.theme = {\n  backgroundColor: 'rgb(118, 96, 202)',\n  color: 'rgb(255, 255, 255)', width: '90px'\n};`,
      react: `<div style={theme}>Caja</div>\n\nsetTheme({ backgroundColor: 'rgb(118, 96, 202)',\n  color: 'rgb(255, 255, 255)', width: '90px' });`,
      vue: `<div :style="theme">Caja</div>\n\ntheme.value = { backgroundColor: 'rgb(118, 96, 202)',\n  color: 'rgb(255, 255, 255)', width: '90px' };`,
      angular: `<div [style.backgroundColor]="theme.backgroundColor"\n     [style.color]="theme.color"\n     [style.width]="theme.width">Caja</div>`,
      alpine: `<div :style="theme">Caja</div>\n\n// Actualizar el objeto theme en x-data.`,
      vanilla: `for (const node of nodes) {\n  Object.assign(node.style, theme);\n}`,
    }[engine];
  if (method === "classes")
    code = {
      gtpl: `<div class="{{ return 'bench-box ' + className }}">Caja</div>\nstate.className = 'tone-b';`,
      react: `<div className={'bench-box ' + className}>Caja</div>\nsetClassName('tone-b');`,
      vue: `<div class="bench-box" :class="className">Caja</div>\nclassName.value = 'tone-b';`,
      angular: `<div [class]="'bench-box ' + className">Caja</div>\nthis.className = 'tone-b';`,
      alpine: `<div class="bench-box" :class="className">Caja</div>`,
      vanilla: `for (const node of nodes) {\n  node.className = 'bench-box ' + className;\n}`,
    }[engine];
  if (method === "attributes")
    code = {
      gtpl: `<button g-attr="attrs">{{tick}}</button>\nstate.attrs = {title:'Estado 1',\n  'data-state':'1', 'aria-label':'Estado 1'};`,
      react: `<button {...attrs}>{tick}</button>\nsetAttrs({title:'Estado 1',\n  'data-state':'1', 'aria-label':'Estado 1'});`,
      vue: `<button v-bind="attrs">{{tick}}</button>`,
      angular: `<button [title]="attrs.title"\n [attr.data-state]="attrs['data-state']"\n [attr.aria-label]="attrs['aria-label']">\n {{tick}}\n</button>`,
      alpine: `<button :title="attrs.title"
 :data-state="attrs['data-state']"
 :aria-label="attrs['aria-label']" x-text="tick"></button>`,
      vanilla: `for (const node of nodes) {\n  for (const [name,value] of Object.entries(attrs)) {\n    node.setAttribute(name, value);\n  }\n  node.textContent = tick;\n}`,
    }[engine];
  if (method === "forms")
    code = {
      gtpl: `<input type="text" [value]="{{text}}">\n<output>{{text}}</output>`,
      react: `<input value={text}\n  onChange={e => setText(e.target.value)} />\n<output>{text}</output>`,
      vue: `<input v-model="text">\n<output>{{text}}</output>`,
      angular: `<input [value]="text"\n (input)="text=$any($event.target).value">\n<output>{{text}}</output>`,
      alpine: `<input x-model="text">\n<output x-text="text"></output>`,
      vanilla: `input.addEventListener('input', () => {\n  model.text = input.value;\n  for (const field of inputs) field.value = model.text;\n  output.textContent = model.text;\n});`,
    }[engine];
  if (method === "grid")
    code = {
      gtpl: `<span class="grid-cell" data-value="{{value}}">{{value}}</span>

// Una instancia por celda; generador AOT compartido.
const models = [], apps = [];
for (let id = 0; id < columns * rows; id++) {
  const model = { id, value: 0 };
  const app = new GTpl({ root: model, generator });
  app.addTo(grid);
  models.push(model); apps.push(app);
}
// En cada lote de requestAnimationFrame:
for (let i = 0; i < indices.length; i++) {
  models[indices[i]].value = values[i];
}`,
      react: `function Cell({ id, setters }) {
  const [value, setValue] = useState(0);
  useLayoutEffect(() => {
    setters[id] = setValue;
    return () => { delete setters[id]; };
  }, [id, setters]);
  return <span className="grid-cell" data-value={value}>
    {value}
  </span>;
}
// En cada lote de requestAnimationFrame:
flushSync(() => {
  for (let i = 0; i < indices.length; i++) {
    setters[indices[i]](values[i]);
  }
});`,
      vue: `// Componente Cell, con un modelo reactivo por celda:
<span class="grid-cell" :data-value="model.value">
  {{model.value}}
</span>

const models = Array.from({ length: columns * rows },
  (_, id) => reactive({ id, value: 0 }));
// Un componente Cell por modelo.
// En cada lote de requestAnimationFrame:
for (let i = 0; i < indices.length; i++) {
  models[indices[i]].value = values[i];
}
await nextTick();`,
      angular: `// Componente Cell con ChangeDetectionStrategy.OnPush:
<span class="grid-cell" [attr.data-value]="model.value()">
  {{model.value()}}
</span>

const models = Array.from({ length: columns * rows },
  (_, id) => ({ id, value: signal(0) }));
// Un componente Cell por modelo.
// En cada lote de requestAnimationFrame:
for (let i = 0; i < indices.length; i++) {
  models[indices[i]].value.set(values[i]);
}
ref.changeDetectorRef.markForCheck();
ref.changeDetectorRef.detectChanges();`,
      alpine: `<!-- Cada celda declara su propio x-data: -->
<span class="grid-cell" x-data="{ value: 0 }"
  :data-value="value" x-text="value"></span>

const models = Array.from(grid.children,
  cell => Alpine.$data(cell));
// En cada lote de requestAnimationFrame:
for (let i = 0; i < indices.length; i++) {
  models[indices[i]].value = values[i];
}`,
      vanilla: `// Un nodo guardado por celda, creado al montar.
// En cada lote de requestAnimationFrame:
for (let i = 0; i < indices.length; i++) {
  const cell = nodes[indices[i]];
  cell.dataset.value = values[i];
  cell.textContent = values[i];
}`,
    }[engine];
  return {
    code,
    note:
      memory +
      (id === "gtpl-jit"
        ? " GTPL JIT compila la plantilla al montar; AOT la precompila en el build."
        : ""),
  };
}
