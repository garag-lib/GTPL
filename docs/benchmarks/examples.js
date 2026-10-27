const gView = `<div g-switch="tab">
  <p g-case="'0'">Inicio: {{count}}</p>
  <p g-case="'1'">Perfil: {{count}}</p>
  <p g-case="'2'">Ajustes: {{count}}</p>
</div>
<button onclick="{{this.tab = (this.tab + 1) % 3}}">Cambiar</button>
<button onclick="{{this.count++}}">+1</button>`;

export const examples = {
  gtpl: {
    code: `<!-- view.html · compilar durante el build -->
${gView}

// main.js
import gtpl from '@mpeliz/gtpl';
import generator from './view.aot.js';

const state = { tab: 0, count: 0 };
const app = new gtpl.GTpl({ root: state, generator });
app.addTo(document.querySelector('#app'));
await app.ready();`,
    note: "Plantilla + arranque. view.aot.js es el generador producido en el build con GCodeOptimized(template, { methodAliases: true }) y GGenerator; no se incluye ese paso de herramientas en el recuento.",
  },
  "gtpl-jit": {
    code: `import gtpl from '@mpeliz/gtpl';
const { GTpl, jit: { GCodeOptimized, GCompile } } = gtpl;

const template = \`${gView}\`;
const state = { tab: 0, count: 0 };
const generator = GCompile(GCodeOptimized(template, { methodAliases: true }));
const app = new GTpl({ root: state, generator });
app.addTo(document.querySelector('#app'));
await app.ready();`,
    note: "El HTML se compila al ejecutar. Las ramas se crean al activarlas; el arranque incluye el compilador de plantillas.",
  },
  vue: {
    code: `<!-- App.vue -->
<script setup>
import { ref } from 'vue';
const tab = ref(0);
const count = ref(0);
</script>

<template>
  <p v-if="tab === 0">Inicio: {{count}}</p>
  <p v-else-if="tab === 1">Perfil: {{count}}</p>
  <p v-else>Ajustes: {{count}}</p>
  <button @click="tab = (tab + 1) % 3">Cambiar</button>
  <button @click="count++">+1</button>
</template>

// main.js · con compilador SFC en el build
import { createApp } from 'vue';
import App from './App.vue';
createApp(App).mount('#app');`,
    note: "Componente SFC + arranque. v-if construye solo la rama activa. Las herramientas de compilación SFC no entran en el recuento.",
  },
  react: {
    code: `import { useState } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  const [tab, setTab] = useState(0);
  const [count, setCount] = useState(0);
  let panel;
  switch (tab) {
    case 0: panel = <p key="0">Inicio: {count}</p>; break;
    case 1: panel = <p key="1">Perfil: {count}</p>; break;
    case 2: panel = <p key="2">Ajustes: {count}</p>; break;
  }
  return <>
    {panel}
    <button onClick={() => setTab(t => (t + 1) % 3)}>
      Cambiar
    </button>
    <button onClick={() => setCount(c => c + 1)}>+1</button>
  </>;
}

createRoot(document.querySelector('#app')).render(<App />);`,
    note: "Componente JSX + arranque. El switch es JavaScript y solo evalúa la rama elegida. Las keys fuerzan una instancia nueva al cambiar de rama, igual que en el benchmark. El build de JSX queda fuera del recuento.",
  },
  alpine: {
    code: `<!-- index.html -->
<div x-data="{ tab: 0, count: 0 }">
  <template x-if="tab === 0">
    <p>Inicio: <span x-text="count"></span></p>
  </template>
  <template x-if="tab === 1">
    <p>Perfil: <span x-text="count"></span></p>
  </template>
  <template x-if="tab === 2">
    <p>Ajustes: <span x-text="count"></span></p>
  </template>
  <button @click="tab = (tab + 1) % 3">Cambiar</button>
  <button @click="count++">+1</button>
</div>

// main.js
import Alpine from 'alpinejs';
window.Alpine = Alpine;
Alpine.start();`,
    note: "HTML + arranque. x-if clona la rama desde un template al activarse y la retira al desactivarse. El benchmark usa x-if, no x-show.",
  },
  angular: {
    code: `import { Component, signal, provideZonelessChangeDetection }
  from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';

@Component({
  selector: 'app-root',
  standalone: true,
  template: \`
    @switch (tab()) {
      @case (0) { <p>Inicio: {{count()}}</p> }
      @case (1) { <p>Perfil: {{count()}}</p> }
      @case (2) { <p>Ajustes: {{count()}}</p> }
    }
    <button (click)="next()">Cambiar</button>
    <button (click)="increment()">+1</button>
  \`
})
class App {
  tab = signal(0);
  count = signal(0);
  next() { this.tab.update(t => (t + 1) % 3); }
  increment() { this.count.update(c => c + 1); }
}

bootstrapApplication(App, {
  providers: [provideZonelessChangeDetection()]
});`,
    note: "Componente + arranque, con <app-root> en el HTML. @switch instancia la vista activa. La configuración del compilador AOT no entra en el recuento. El adaptador medido usa detectChanges explícito para confirmar cada render.",
  },
  vanilla: {
    code: `const host = document.querySelector('#app');
const state = { tab: 0, count: 0 };
const panel = document.createElement('section');
const next = document.createElement('button');
const plus = document.createElement('button');
next.textContent = 'Cambiar';
plus.textContent = '+1';
host.append(panel, next, plus);

function render() {
  const p = document.createElement('p');
  switch (state.tab) {
    case 0: p.textContent = 'Inicio: ' + state.count; break;
    case 1: p.textContent = 'Perfil: ' + state.count; break;
    case 2: p.textContent = 'Ajustes: ' + state.count; break;
  }
  panel.replaceChildren(p);
}
next.onclick = () => {
  state.tab = (state.tab + 1) % 3;
  render();
};
plus.onclick = () => { state.count++; render(); };
render();`,
    note: "DOM manual + arranque. La sincronización y la limpieza corren a cargo de la aplicación. Sirve como referencia especializada; no ofrece las mismas abstracciones que un framework.",
  },
};
