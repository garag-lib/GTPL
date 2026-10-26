import { compile, compileModule } from "svelte/compiler";
import { writeFile } from "node:fs/promises";
import path from "node:path";
// Only generated client code enters the browser bundles; the compiler stays here.
export async function prepareSvelteState(work) {
  const source =
    "export function reactiveState(initial) { const state = $state(initial); return state; }";
  await writeFile(
    path.join(work, "svelte-state.js"),
    compileModule(source, {
      filename: "svelte-state.svelte.js",
      dev: false,
      generate: "client",
    }).js.code,
  );
}
export async function writeSvelteComponent(work, name, markup, imports = "") {
  const source = `<script>${imports}\nlet { state } = $props();</script>\n${markup}`;
  const result = compile(source, {
    filename: `${name}.svelte`,
    generate: "client",
    dev: false,
    runes: true,
    discloseVersion: false,
  });
  const file = path.join(work, `${name}.js`);
  await writeFile(file, result.js.code);
  return `./${name}.js`;
}
export const svelteImports = `import {mount,unmount,flushSync} from 'svelte';import {reactiveState} from './svelte-state.js';`;
