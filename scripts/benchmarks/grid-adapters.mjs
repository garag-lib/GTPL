import { compile } from "@vue/compiler-dom";
import { writeFile } from "node:fs/promises";
import path from "node:path";

export async function createGridSources({ root, work, GCode }) {
  const template =
    '<span class="grid-cell" data-cell="{{id}}" data-value="{{value}}">{{value}}</span>';
  const imports = `import {GTpl} from ${JSON.stringify(path.join(root, "src/GTpl.ts"))}; import {GGenerator as g} from ${JSON.stringify(path.join(root, "src/GGenerator.ts"))};`;
  const gtpl = (generator) => `${imports}
${generator}
export function createAdapter() { let apps=[],models=[]; return {
  async mount(host,{columns,rows}) { const grid=document.createElement('div');grid.className='bench-grid';host.append(grid); const generator=getGenerator();
    for(let id=0;id<columns*rows;id++){const model={id,value:0};const app=new GTpl({root:model,generator});app.addTo(grid);models.push(model);apps.push(app);}await Promise.all(apps.map(app=>app.ready())); },
  update({indices,values}) {for(let i=0;i<indices.length;i++)models[indices[i]].value=values[i];},
  destroy(){for(const app of apps)app.destroy();apps=[];models=[];}
};}`;
  const sources = {
    "grid-gtpl": gtpl(
      `const generator=${GCode(template)};const getGenerator=()=>generator;`,
    ),
    "grid-gtpl-jit": gtpl(
      `import {GCode} from ${JSON.stringify(path.join(root, "src/compiler/GCode.ts"))};import {GCompile} from ${JSON.stringify(path.join(root, "src/GGenerator.ts"))};const getGenerator=()=>GCompile(GCode(${JSON.stringify(template)}));`,
    ),
    "grid-react": `import {createElement as h,useState,useLayoutEffect} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
function Cell({id,setters}){const [value,setValue]=useState(0);useLayoutEffect(()=>{setters[id]=setValue;return()=>{delete setters[id]};},[id,setters]);return h('span',{className:'grid-cell','data-cell':id,'data-value':value},value);}
export function createAdapter(){let app,setters=[];return {
  mount(host,{columns,rows}){app=createRoot(host);flushSync(()=>app.render(h('div',{className:'bench-grid'},Array.from({length:columns*rows},(_,id)=>h(Cell,{id,key:id,setters})))));},
  update({indices,values}){flushSync(()=>{for(let i=0;i<indices.length;i++)setters[indices[i]](values[i]);});},
  destroy(){if(app)flushSync(()=>app.unmount());app=null;setters=[];}
};}`,
    "grid-vue": `import {createApp,reactive,nextTick,h} from 'vue';
${compile('<span class="grid-cell" :data-cell="model.id" :data-value="model.value">{{model.value}}</span>', { mode: "module", prefixIdentifiers: true, hoistStatic: true }).code}
const Cell={props:['model'],render};
export function createAdapter(){let app,models=[];return {
  mount(host,{columns,rows}){models=Array.from({length:columns*rows},(_,id)=>reactive({id,value:0}));app=createApp({render:()=>h('div',{className:'bench-grid'},models.map(model=>h(Cell,{key:model.id,model})))});app.mount(host);},
  async update({indices,values}){for(let i=0;i<indices.length;i++)models[indices[i]].value=values[i];await nextTick();},
  destroy(){app?.unmount();app=null;models=[];}
};}`,
    "grid-alpine": `import Alpine from 'alpinejs';window.Alpine=Alpine;let started=false;
export function createAdapter(){let grid,models=[];return {
  mount(host,{columns,rows}){grid=document.createElement('div');grid.className='bench-grid';grid.innerHTML=Array.from({length:columns*rows},(_,id)=>'<span class="grid-cell" data-cell="'+id+'" x-data="{value:0}" :data-value="value" x-text="value"></span>').join('');Alpine.mutateDom(()=>host.append(grid));if(!started){Alpine.start();started=true;}else Alpine.initTree(grid);models=Array.from(grid.children,cell=>Alpine.$data(cell));},
  update({indices,values}){for(let i=0;i<indices.length;i++)models[indices[i]].value=values[i];},
  destroy(){if(grid){Alpine.destroyTree(grid);Alpine.mutateDom(()=>grid.remove());}grid=null;models=[];}
};}`,
    "grid-vanilla": `export function createAdapter(){let grid,nodes=[];return {
  mount(host,{columns,rows}){grid=document.createElement('div');grid.className='bench-grid';for(let id=0;id<columns*rows;id++){const cell=document.createElement('span');cell.className='grid-cell';cell.dataset.cell=id;cell.dataset.value=0;cell.textContent='0';grid.append(cell);nodes.push(cell);}host.append(grid);},
  update({indices,values}){for(let i=0;i<indices.length;i++){const cell=nodes[indices[i]];cell.dataset.value=values[i];cell.textContent=values[i];}},
  destroy(){grid?.remove();grid=null;nodes=[];}
};}`,
  };
  await writeFile(
    path.join(work, "grid-angular.ts"),
    `import {Component,Input,ChangeDetectionStrategy,signal,enableProdMode,provideZonelessChangeDetection} from '@angular/core';import {bootstrapApplication} from '@angular/platform-browser';
enableProdMode();
@Component({selector:'grid-cell',standalone:true,changeDetection:ChangeDetectionStrategy.OnPush,template:'<span class="grid-cell" [attr.data-cell]="model.id" [attr.data-value]="model.value()">{{model.value()}}</span>'})
class Cell {@Input() model:any;}
@Component({selector:'bench-grid-app',standalone:true,imports:[Cell],changeDetection:ChangeDetectionStrategy.Default,template:'<div class="bench-grid">@for (cell of cells; track cell.id) {<grid-cell [model]="cell" />}</div>'})
class Grid {cells:any[]=[];}
export function createAdapter(){let app:any,ref:any,models:any[]=[];return {
  async mount(host:HTMLElement,{columns,rows}:any){host.innerHTML='<bench-grid-app></bench-grid-app>';models=Array.from({length:columns*rows},(_,id)=>({id,value:signal(0)}));app=await bootstrapApplication(Grid,{providers:[provideZonelessChangeDetection()]});ref=app.components[0];ref.instance.cells=models;ref.changeDetectorRef.markForCheck();ref.changeDetectorRef.detectChanges();},
  update({indices,values}:any){for(let i=0;i<indices.length;i++)models[indices[i]].value.set(values[i]);ref.changeDetectorRef.markForCheck();ref.changeDetectorRef.detectChanges();},
  destroy(){app?.destroy();app=ref=null;models=[];}
};}`,
  );
  return sources;
}
