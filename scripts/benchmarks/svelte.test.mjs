import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { methodKeys, methodTemplate, BLOCKS } from "./method-definitions.mjs";
import {
  prepareSvelteState,
  writeSvelteComponent,
  svelteImports,
  productionConditions,
} from "./svelte-adapters.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
test("production Svelte components obey the same method DOM and lifecycle contracts", async () => {
  const work = await mkdtemp(path.join(tmpdir(), "gtpl-svelte-"));
  try {
    await prepareSvelteState(work);
    for (const key of methodKeys) {
      const component = await writeSvelteComponent(
        work,
        key,
        methodTemplate(key, "svelte"),
      );
      const result = await build({
        stdin: {
          resolveDir: work,
          contents: `${svelteImports}import View from '${component}';
export function createAdapter(){let state=reactiveState({active:null,visible:false,tick:0,rows:[{id:0,label:'a',value:1},{id:1,label:'b',value:2}],items:[{id:0},{id:1}],theme:{backgroundColor:'red',color:'black',width:'120px'},className:'tone-a',attrs:{title:'zero','data-state':'0'},text:'initial'}),app;
return {mount(target){flushSync(()=>{app=mount(View,{target,props:{state}});});},set(patch){flushSync(()=>Object.assign(state,patch));},destroy(){flushSync(()=>unmount(app));}};}`,
        },
        bundle: true,
        metafile: true,
        platform: "browser",
        conditions: productionConditions,
        format: "iife",
        globalName: "adapter",
        write: false,
        minify: true,
        nodePaths: [path.join(here, "node_modules")],
        define: { "process.env.NODE_ENV": '"production"' },
        logLevel: "silent",
      });
      assert.equal(
        Object.keys(result.metafile.inputs).some((file) =>
          file.endsWith("esm-env/dev-fallback.js"),
        ),
        false,
        "production benchmarks must resolve DEV at build time, not from globals in the browser",
      );
      const dom = new JSDOM("<main></main><aside></aside>", {
        runScripts: "outside-only",
      });
      try {
        dom.window.eval(result.outputFiles[0].text);
        dom.window.eval(
          'window.view=adapter.createAdapter();view.mount(document.querySelector("main"));window.other=adapter.createAdapter();other.mount(document.querySelector("aside"));',
        );
        const host = dom.window.document.querySelector("main");
        const set = (patch) =>
          dom.window.eval(`view.set(${JSON.stringify(patch)})`);
        if (key.startsWith("switch-") || key === "if") {
          assert.equal(
            host.querySelectorAll(".bench-block").length,
            0,
            key + " inactive",
          );
          set(key === "if" ? { visible: true } : { active: 0 });
          assert.equal(host.querySelectorAll(".bench-block").length, BLOCKS);
          set({ tick: 7 });
          assert.ok(
            [...host.querySelectorAll(".bench-value")].every(
              (n) => n.textContent === "7",
            ),
          );
          if (key !== "if") {
            set({ active: Number(key.split("-")[1]) - 1 });
            assert.equal(host.querySelectorAll(".bench-branch").length, 1);
          }
          set(key === "if" ? { visible: false } : { active: null });
          assert.equal(host.querySelectorAll(".bench-block").length, 0);
        } else if (key === "for") {
          set({
            rows: [
              { id: 1, label: "b2", value: 8 },
              { id: 2, label: "c", value: 9 },
            ],
          });
          assert.deepEqual(
            [...host.querySelectorAll(".method-row")].map((n) => n.dataset.key),
            ["1", "2"],
          );
          assert.equal(host.textContent, "b28c9");
        } else if (key === "styles") {
          set({
            theme: { backgroundColor: "blue", color: "white", width: "90px" },
          });
          assert.equal(host.querySelector(".bench-box").style.width, "90px");
        } else if (key === "classes") {
          set({ className: "tone-b" });
          assert.equal(host.querySelectorAll(".tone-b").length, 2);
        } else if (key === "attributes") {
          set({ attrs: { title: "one", "data-state": "1" }, tick: 5 });
          assert.equal(host.querySelector("button").dataset.state, "1");
          assert.equal(host.querySelector("button").textContent, "5");
        } else if (key === "forms") {
          dom.window.eval(
            `const input=document.querySelector('main input');input.value='typed';input.dispatchEvent(new Event('input',{bubbles:true}));`,
          );
          // The input handler updates state synchronously; set() also flushes pending DOM effects.
          set({});
          assert.equal(host.querySelector("output").textContent, "typed");
          assert.ok(
            [...host.querySelectorAll("input")].every(
              (n) => n.value === "typed",
            ),
          );
          assert.equal(
            dom.window.document.querySelector("aside output").textContent,
            "initial",
          );
        }
        dom.window.eval("view.destroy();other.destroy();");
        assert.equal(host.children.length, 0);
      } finally {
        dom.window.close();
      }
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});
test("Svelte is selectable on both sides of the benchmark", async () => {
  const html = await readFile(
    path.resolve(here, "../../docs/benchmarks.html"),
    "utf8",
  );
  const dom = new JSDOM(html);
  for (const id of ["engine-a", "engine-b"])
    assert.ok(
      dom.window.document.querySelector(`#${id} option[value="svelte"]`),
    );
  dom.window.close();
});
