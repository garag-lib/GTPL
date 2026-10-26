import { writeSvelteComponent, svelteImports } from "./svelte-adapters.mjs";
import { compile } from "@vue/compiler-dom";
import { build } from "esbuild";
import { transformAsync } from "@babel/core";
import angularLinker from "@angular/compiler-cli/linker/babel";
import { readFile, writeFile, mkdir, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import {
  methodKeys,
  methodTemplate,
  reactView,
  heavyHtml,
  BLOCKS,
} from "./method-definitions.mjs";
export async function prepareMethods({ root, work, GCode }) {
  await writeFile(
    path.join(work, "method-state.js"),
    `export function createState(size){return {active:null,visible:false,tick:0,rows:Array.from({length:size},(_,id)=>({id,label:'Item '+id,value:0})),items:Array.from({length:size},(_,id)=>({id})),theme:{backgroundColor:'rgb(216, 243, 106)',color:'rgb(19, 34, 24)',width:'120px'},className:'tone-a',attrs:{title:'Estado 0','data-state':'0','aria-label':'Estado 0'},text:'inicial'};}
export function input(host,value){const el=host.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));}`,
  );
  const entries = {},
    angularFiles = [];
  const stateImport = `import {createState,input} from './method-state.js';`;
  for (const key of methodKeys) {
    const template = methodTemplate(key, "gtpl"),
      code = GCode(template);
    for (const id of [
      "gtpl",
      "gtpl-jit",
      "react",
      "vue",
      "svelte",
      "alpine",
      "vanilla",
    ]) {
      let source;
      if (id.startsWith("gtpl"))
        source = `${stateImport} import {GTpl} from ${JSON.stringify(path.join(root, "src/GTpl.ts"))};import {GGenerator as g,GCompile} from ${JSON.stringify(path.join(root, "src/GGenerator.ts"))};
${id === "gtpl-jit" ? `import {GCode} from ${JSON.stringify(path.join(root, "src/compiler/GCode.ts"))};const generator=()=>GCompile(GCode(${JSON.stringify(template)}));` : `const compiled=${code};const generator=()=>compiled;`}
export function createAdapter({size}){let app,host,state=createState(size);return {async mount(target){host=target;app=new GTpl({root:state,generator:generator()});app.addTo(host);await app.ready();},set(patch){Object.assign(state,patch);},input(value){input(host,value);},destroy(){app?.destroy();app=host=state=null;}};}`;
      if (id === "react")
        source = `${stateImport} import {createElement as h} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';${reactView(key)}
export function createAdapter({size}){let app,host,state=createState(size);function change(patch){state={...state,...patch};app.render(h(View,{...state,change}));}return {mount(target){host=target;app=createRoot(host);flushSync(()=>change({}));},set(patch){flushSync(()=>change(patch));},input(value){flushSync(()=>input(host,value));},destroy(){if(app)flushSync(()=>app.unmount());app=host=state=null;}};}`;
      if (id === "vue")
        source = `${stateImport} import {createApp,reactive,nextTick} from 'vue';${compile(methodTemplate(key, "vue"), { mode: "module", prefixIdentifiers: true, hoistStatic: true }).code}
export function createAdapter({size}){let app,host,state=reactive(createState(size));return {mount(target){host=target;app=createApp({setup:()=>state,render});app.mount(host);},async set(patch){Object.assign(state,patch);await nextTick();},async input(value){input(host,value);await nextTick();},destroy(){app?.unmount();app=host=state=null;}};}`;
      if (id === "svelte") {
        const component = await writeSvelteComponent(
          work,
          `method-${key}-svelte-view`,
          methodTemplate(key, "svelte"),
        );
        source = `${stateImport}${svelteImports}import View from '${component}';
export function createAdapter({size}){let app,host,state=reactiveState(createState(size));return {mount(target){host=target;flushSync(()=>{app=mount(View,{target,props:{state}});});},set(patch){flushSync(()=>Object.assign(state,patch));},input(value){flushSync(()=>input(host,value));},destroy(){if(app)flushSync(()=>unmount(app));app=host=state=null;}};}`;
      }
      if (id === "alpine")
        source = `${stateImport} import Alpine from 'alpinejs';window.Alpine=Alpine;let state;Alpine.data('benchMethod',()=>state);let started=false;
export function createAdapter({size}){let host,element;state=createState(size);return {mount(target){host=target;Alpine.mutateDom(()=>{host.innerHTML=${JSON.stringify(methodTemplate(key, "alpine"))};});element=host.firstElementChild;if(!started){Alpine.start();started=true;}else Alpine.initTree(element);state=Alpine.$data(element);},set(patch){Object.assign(state,patch);},input(value){input(host,value);},destroy(){if(element){Alpine.destroyTree(element);Alpine.mutateDom(()=>element.remove());}element=host=state=null;}};}`;
      if (id === "vanilla") source = vanillaSource(key, stateImport);
      const file = path.join(work, `method-${key}-${id}.js`);
      await writeFile(file, source);
      entries[`${key}-${id}`] = file;
    }
    const file = `method-${key}-angular.ts`,
      selector = `method-${key.replaceAll("-", "")}-app`;
    await writeFile(
      path.join(work, file),
      `import {Component,ChangeDetectionStrategy,enableProdMode,provideZonelessChangeDetection} from '@angular/core';import {bootstrapApplication} from '@angular/platform-browser';enableProdMode();
@Component({selector:${JSON.stringify(selector)},standalone:true,changeDetection:ChangeDetectionStrategy.Default,template:${JSON.stringify(methodTemplate(key, "angular"))}})class View{active:any=null;visible=false;tick=0;rows:any[]=[];items:any[]=[];theme:any={};className='tone-a';attrs:any={};text='inicial';}
export function createAdapter({size}:any){let app:any,ref:any,host:HTMLElement;const initial={active:null,visible:false,tick:0,rows:Array.from({length:size},(_,id)=>({id,label:'Item '+id,value:0})),items:Array.from({length:size},(_,id)=>({id})),theme:{backgroundColor:'rgb(216, 243, 106)',color:'rgb(19, 34, 24)',width:'120px'},className:'tone-a',attrs:{title:'Estado 0','data-state':'0','aria-label':'Estado 0'},text:'inicial'};const flush=()=>{ref.changeDetectorRef.markForCheck();ref.changeDetectorRef.detectChanges();};return {async mount(target:HTMLElement){host=target;host.innerHTML='<${selector}></${selector}>';app=await bootstrapApplication(View,{providers:[provideZonelessChangeDetection()]});ref=app.components[0];Object.assign(ref.instance,initial);flush();},set(patch:any){Object.assign(ref.instance,patch);flush();},input(value:string){const el=host.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));flush();},destroy(){app?.destroy();host?.replaceChildren();app=ref=host=null;}};}`,
    );
    angularFiles.push(file);
    entries[`${key}-angular`] = path.join(
      work,
      "ng",
      file.replace(".ts", ".js"),
    );
  }
  return { entries, angularFiles };
}
function vanillaSource(key, stateImport) {
  const count = key.startsWith("switch-") ? Number(key.split("-")[1]) : 1;
  const branches =
    key.startsWith("switch-") || key === "if"
      ? Array.from(
          { length: count },
          (_, i) =>
            `<section class="bench-branch" data-branch="${i}">${heavyHtml(i).replaceAll("{{tick}}", "__TICK__")}</section>`,
        )
      : [];
  return `${stateImport}
const branches=${JSON.stringify(branches)};
export function createAdapter({size}){let host,state=createState(size),active=null,nodes=[],byId=new Map();
function render(){
  ${
    key.startsWith("switch-") || key === "if"
      ? `const next=${key === "if" ? "state.visible?0:null" : "state.active"};if(next!==active){host.innerHTML=next===null?'':branches[next].replaceAll('__TICK__',state.tick);active=next;}else for(const el of host.querySelectorAll('.bench-value'))el.textContent=state.tick;`
      : key === "for"
        ? `const order=[];for(const row of state.rows){let el=byId.get(row.id);if(!el){el=document.createElement('article');el.className='method-row';el.dataset.key=row.id;el.innerHTML='<b></b><i></i>';byId.set(row.id,el);}el.children[0].textContent=row.label;el.children[1].textContent=row.value;order.push(el);}const ids=new Set(state.rows.map(r=>r.id));for(const [id,el]of byId)if(!ids.has(id)){el.remove();byId.delete(id);}for(const el of order)host.append(el);`
        : `if(!nodes.length){for(let i=0;i<size;i++){const el=document.createElement(${JSON.stringify(key === "forms" ? "input" : key === "attributes" ? "button" : "div")});el.className=${JSON.stringify(key === "forms" ? "bench-input" : key === "attributes" ? "bench-attr" : "bench-box")};if(${JSON.stringify(key)}==='forms'){el.type='text';el.addEventListener('input',()=>{state.text=el.value;render();});}else el.textContent='Caja';host.append(el);nodes.push(el);}if(${JSON.stringify(key)}==='forms'){const out=document.createElement('output');out.className='form-output';host.append(out);}}
for(const el of nodes){${key === "forms" ? `el.value=state.text;` : key === "styles" ? `Object.assign(el.style,state.theme);` : key === "classes" ? `el.className='bench-box '+state.className;` : `for(const [name,value]of Object.entries(state.attrs))el.setAttribute(name,value);el.textContent=state.tick;`}}${key === "forms" ? `host.querySelector('output').textContent=state.text;` : ""}`
  }
}
return {mount(target){host=target;render();},set(patch){Object.assign(state,patch);render();},input(value){input(host,value);},destroy(){host?.replaceChildren();byId.clear();nodes=[];host=state=null;}};}`;
}
export async function bundleMethods({ prepared, root, work, versions }) {
  const outdir = path.join(root, "docs/benchmarks/methods");
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  const result = await build({
    entryPoints: prepared.entries,
    outdir,
    bundle: true,
    splitting: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: true,
    metafile: true,
    legalComments: "external",
    chunkNames: "chunks/[name]-[hash]",
    nodePaths: [path.join(work, "..")],
    define: {
      "process.env.NODE_ENV": '"production"',
      ngDevMode: "false",
      ngJitMode: "false",
      __VUE_OPTIONS_API__: "false",
      __VUE_PROD_DEVTOOLS__: "false",
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
    },
    plugins: [
      {
        name: "angular-linker",
        setup(builder) {
          builder.onLoad({ filter: /@angular\/.*\.m?js$/ }, async (args) => ({
            contents: (
              await transformAsync(await readFile(args.path, "utf8"), {
                filename: args.path,
                plugins: [angularLinker],
                configFile: false,
                babelrc: false,
              })
            ).code,
            loader: "js",
          }));
        },
      },
    ],
    logLevel: "warning",
  });
  for (const file of await readdir(outdir, { recursive: true })) {
    if (file.endsWith(".LEGAL.txt")) {
      const target = path.join(outdir, file);
      const contents = await readFile(target, "utf8");
      await writeFile(
        target,
        contents.replace(/\r\n/g, "\n").replace(/[\t ]+$/gm, ""),
      );
    }
  }
  const outputs = result.metafile.outputs,
    byEntry = new Map(
      Object.entries(outputs)
        .filter(([, meta]) => meta.entryPoint)
        .map(([file, meta]) => [path.resolve(meta.entryPoint), file]),
    );
  const methods = {};
  for (const [name, entry] of Object.entries(prepared.entries)) {
    const id = name.endsWith("gtpl-jit") ? "gtpl-jit" : name.split("-").at(-1),
      key = name.slice(0, -id.length - 1),
      file = byEntry.get(path.resolve(entry));
    const files = new Set();
    const visit = (f) => {
      if (files.has(f)) return;
      files.add(f);
      for (const imp of outputs[f].imports) if (!imp.external) visit(imp.path);
    };
    visit(file);
    const assets = [];
    for (const f of files) {
      const bytes = await readFile(f);
      assets.push({
        file: path
          .relative(path.join(root, "docs"), path.resolve(f))
          .replaceAll("\\", "/"),
        bytes: bytes.length,
        gzipBytes: gzipSync(bytes).length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
    methods[key] ??= {};
    methods[key][id] = {
      file: path
        .relative(path.join(root, "docs"), path.resolve(file))
        .replaceAll("\\", "/"),
      version: versions[id],
      blocksPerBranch: BLOCKS,
      declaredCases: key.startsWith("switch-")
        ? Number(key.split("-")[1])
        : null,
      assets,
      bytes: assets.reduce((s, a) => s + a.bytes, 0),
      gzipBytes: assets.reduce((s, a) => s + a.gzipBytes, 0),
    };
  }
  return methods;
}
