// Keep every adapter's rendered workload identical: one branch, N rows, 3 cells.
export const CASES = 12;
export const ids = Array.from({ length: CASES }, (_, i) => i);
const gRow =
  '<div class="bench-row" data-row="{{row.id}}"><span>{{row.id}}</span><b>{{row.label}}</b><i>{{tick}}</i></div>';
const vRow =
  '<div class="bench-row" v-for="row in rows" :key="row.id" :data-row="row.id"><span>{{row.id}}</span><b>{{row.label}}</b><i>{{tick}}</i></div>';
const aRow =
  '<template x-for="row in rows" :key="row.id"><div class="bench-row" :data-row="row.id"><span x-text="row.id"></span><b x-text="row.label"></b><i x-text="tick"></i></div></template>';
const ngRow =
  '@for (row of rows; track row.id) {<div class="bench-row" [attr.data-row]="row.id"><span>{{row.id}}</span><b>{{row.label}}</b><i>{{tick}}</i></div>}';
export const templates = {
  svelte: `<div>${ids.map((i) => `{${i ? ":else if" : "#if"} state.active === ${i}}<section class="bench-branch" data-branch="${i}">{#each state.rows as row (row.id)}<div class="bench-row" data-row={row.id}><span>{row.id}</span><b>{row.label}</b><i>{state.tick}</i></div>{/each}</section>`).join("")}{/if}</div>`,
  gtpl: `<div g-switch="active">${ids.map((i) => `<section g-case="'${i}'" class="bench-branch" data-branch="${i}"><template g-for="rows;index;row">${gRow}</template></section>`).join("")}</div>`,
  vue: `<div>${ids.map((i) => `<section ${i === 0 ? "v-if" : "v-else-if"}="active === ${i}" class="bench-branch" data-branch="${i}">${vRow}</section>`).join("")}</div>`,
  alpine: `<div x-data="bench">${ids.map((i) => `<template x-if="active === ${i}"><section class="bench-branch" data-branch="${i}">${aRow}</section></template>`).join("")}</div>`,
  angular: `<div>@switch (active) {${ids.map((i) => `@case (${i}) {<section class="bench-branch" data-branch="${i}">${ngRow}</section>}`).join("")}}</div>`,
};
