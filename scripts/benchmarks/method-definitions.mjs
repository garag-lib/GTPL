export const BLOCKS = 128;
export const methodKeys = [
  "switch-8",
  "switch-32",
  "switch-64",
  "for",
  "if",
  "styles",
  "classes",
  "attributes",
  "forms",
];
export const branchTitle = (branch, index) =>
  `Vista ${branch} · bloque ${index}`;
export const branchText = (branch, index) =>
  `Contenido propio de la vista ${branch}, bloque ${index}. Este panel contiene títulos, texto, datos reactivos y opciones. Su árbol solo debe construirse al activarlo.`;

export function heavyHtml(branch, engine = "gtpl") {
  return Array.from(
    { length: BLOCKS },
    (_, i) =>
      `<article class="bench-block" data-block="${i}"><h4>${branchTitle(branch, i)}</h4><p>${branchText(branch, i)}</p><div><strong>Dato reactivo</strong><span class="bench-value"${engine === "alpine" ? ' x-text="tick"' : ""}>${engine === "alpine" ? "" : "{{tick}}"}</span></div><ul><li>Opción A</li><li>Opción B</li></ul></article>`,
  ).join("");
}
export function methodTemplate(key, engine) {
  const isSwitch = key.startsWith("switch-");
  if (isSwitch) {
    const count = Number(key.split("-")[1]);
    const branch = (i) =>
      `<section class="bench-branch" data-branch="${i}">${heavyHtml(i, engine)}</section>`;
    if (engine === "gtpl")
      return `<div g-switch="active">${Array.from({ length: count }, (_, i) => `<section g-case="'${i}'" class="bench-branch" data-branch="${i}">${heavyHtml(i, engine)}</section>`).join("")}</div>`;
    if (engine === "vue")
      return `<div>${Array.from({ length: count }, (_, i) => branch(i).replace("<section ", `<section ${i ? "v-else-if" : "v-if"}="active === ${i}" `)).join("")}</div>`;
    if (engine === "alpine")
      return `<div x-data="benchMethod">${Array.from({ length: count }, (_, i) => `<template x-if="active === ${i}">${branch(i)}</template>`).join("")}</div>`;
    return `<div>@switch (active) {${Array.from({ length: count }, (_, i) => `@case (${i}) {${branch(i)}}`).join("")}}</div>`;
  }
  if (key === "if") {
    const body = `<section class="bench-branch" data-branch="0">${heavyHtml(0, engine)}</section>`;
    return engine === "gtpl"
      ? body.replace("<section ", '<section g-if="visible" ')
      : engine === "vue"
        ? body.replace("<section ", '<section v-if="visible" ')
        : engine === "alpine"
          ? `<div x-data="benchMethod"><template x-if="visible">${body}</template></div>`
          : `<div>@if (visible) {${body}}</div>`;
  }
  const items = key === "for" ? "rows" : "items";
  let content;
  if (key === "for")
    content = {
      gtpl: '<article class="method-row" data-key="{{row.id}}"><b>{{row.label}}</b><i>{{row.value}}</i></article>',
      vue: '<article class="method-row" :data-key="row.id"><b>{{row.label}}</b><i>{{row.value}}</i></article>',
      alpine:
        '<article class="method-row" :data-key="row.id"><b x-text="row.label"></b><i x-text="row.value"></i></article>',
      angular:
        '<article class="method-row" [attr.data-key]="row.id"><b>{{row.label}}</b><i>{{row.value}}</i></article>',
    }[engine];
  if (key === "styles")
    content = {
      gtpl: '<div class="bench-box" g-style="background-color:{{theme.backgroundColor}};color:{{theme.color}};width:{{theme.width}}">Caja</div>',
      vue: '<div class="bench-box" :style="theme">Caja</div>',
      alpine: '<div class="bench-box" :style="theme">Caja</div>',
      angular:
        '<div class="bench-box" [style.backgroundColor]="theme.backgroundColor" [style.color]="theme.color" [style.width]="theme.width">Caja</div>',
    }[engine];
  if (key === "classes")
    content = {
      gtpl: "<div class=\"{{ return 'bench-box ' + className }}\">Caja</div>",
      vue: '<div class="bench-box" :class="className">Caja</div>',
      alpine: '<div class="bench-box" :class="className">Caja</div>',
      angular: "<div [class]=\"'bench-box '+className\">Caja</div>",
    }[engine];
  if (key === "attributes")
    content = {
      gtpl: '<button class="bench-attr" g-attr="attrs">{{tick}}</button>',
      vue: '<button class="bench-attr" v-bind="attrs">{{tick}}</button>',
      alpine:
        '<button class="bench-attr" :title="attrs.title" :data-state="attrs[\'data-state\']" :aria-label="attrs[\'aria-label\']" x-text="tick"></button>',
      angular:
        '<button class="bench-attr" [title]="attrs.title" [attr.data-state]="attrs[\'data-state\']" [attr.aria-label]="attrs[\'aria-label\']">{{tick}}</button>',
    }[engine];
  if (key === "forms")
    content = {
      gtpl: '<input class="bench-input" type="text" [value]="{{text}}">',
      vue: '<input class="bench-input" type="text" v-model="text">',
      alpine: '<input class="bench-input" type="text" x-model="text">',
      angular:
        '<input class="bench-input" type="text" [value]="text" (input)="text=$any($event.target).value">',
    }[engine];
  const out =
    key === "forms"
      ? {
          gtpl: '<output class="form-output">{{text}}</output>',
          vue: '<output class="form-output">{{text}}</output>',
          alpine: '<output class="form-output" x-text="text"></output>',
          angular: '<output class="form-output">{{text}}</output>',
        }[engine]
      : "";
  if (engine === "gtpl")
    return `<div><template g-for="${items};index;row">${content}</template>${out}</div>`;
  if (engine === "vue")
    return `<div><template v-for="row in ${items}" :key="row.id">${content}</template>${out}</div>`;
  if (engine === "alpine")
    return `<div x-data="benchMethod"><template x-for="row in ${items}" :key="row.id">${content}</template>${out}</div>`;
  return `<div>@for (row of ${items}; track row.id) {${content}}${out}</div>`;
}
export function reactHeavy(branch) {
  return `[${Array.from({ length: BLOCKS }, (_, i) => `h('article',{className:'bench-block','data-block':${i},key:${i}},h('h4',null,${JSON.stringify(branchTitle(branch, i))}),h('p',null,${JSON.stringify(branchText(branch, i))}),h('div',null,h('strong',null,'Dato reactivo'),h('span',{className:'bench-value'},s.tick)),h('ul',null,h('li',null,'Opción A'),h('li',null,'Opción B')))`).join(",")}]`;
}
export function reactView(key) {
  if (key.startsWith("switch-"))
    return `function Panel(s){switch(s.active){${Array.from({ length: Number(key.split("-")[1]) }, (_, i) => `case ${i}:return h('section',{className:'bench-branch','data-branch':${i},key:${i}},${reactHeavy(i)});`).join("")}default:return null;}} function View(s){return h('div',null,Panel(s));}`;
  if (key === "if")
    return `function View(s){return s.visible?h('section',{className:'bench-branch','data-branch':0},${reactHeavy(0)}):null;}`;
  const body = {
    for: `h('article',{className:'method-row','data-key':row.id,key:row.id},h('b',null,row.label),h('i',null,row.value))`,
    styles: `h('div',{className:'bench-box',style:s.theme,key:row.id},'Caja')`,
    classes: `h('div',{className:'bench-box '+s.className,key:row.id},'Caja')`,
    attributes: `h('button',{className:'bench-attr',...s.attrs,key:row.id},s.tick)`,
    forms: `h('input',{className:'bench-input',type:'text',value:s.text,onChange:e=>s.change({text:e.target.value}),key:row.id})`,
  }[key];
  return `function View(s){return h('div',null,s.${key === "for" ? "rows" : "items"}.map(row=>${body})${key === "forms" ? ",h('output',{className:'form-output'},s.text)" : ""});}`;
}
