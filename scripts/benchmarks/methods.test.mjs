import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import {
  METHODS,
  methodKey,
  selectedMetrics,
} from "../../docs/benchmarks/method-catalog.js";
import { BLOCKS, methodTemplate } from "./method-definitions.mjs";

test("method selection keeps switch memory primary and validates its concrete variant", () => {
  assert.equal(Object.keys(METHODS).length, 8);
  assert.ok(
    selectedMetrics("switch").every(
      (m) => m.kind === "memory" || m.kind === "count",
    ),
  );
  assert.equal(methodKey("switch", 32), "switch-32");
  assert.throws(() => methodKey("switch", 12));
  for (const key of Object.keys(METHODS))
    assert.ok(selectedMetrics(key, true).every(Boolean));
});
test("large switch branches are explicit trees, not a shared loop", () => {
  for (const engine of ["gtpl", "vue", "alpine", "angular", "svelte"]) {
    const html = methodTemplate("switch-8", engine);
    assert.doesNotMatch(html, /g-for|v-for|x-for|@for|\{#each/);
    const dom = new JSDOM(html);
    const branches =
      engine === "alpine"
        ? [...dom.window.document.querySelectorAll("template")].map((t) =>
            t.content.querySelector(".bench-branch"),
          )
        : [...dom.window.document.querySelectorAll(".bench-branch")];
    assert.equal(branches.length, 8);
    for (let i = 0; i < branches.length; i++) {
      assert.equal(branches[i].dataset.branch, String(i));
      assert.equal(branches[i].querySelectorAll(".bench-block").length, BLOCKS);
      assert.match(
        branches[i].querySelector("h4").textContent,
        new RegExp(`Vista ${i}`),
      );
    }
    dom.window.close();
  }
});
test("GTPL style and class benchmarks use supported reactive declarations", async () => {
  const dom = new JSDOM('<!doctype html><div id="app"></div>');
  const keys = [
    "window",
    "document",
    "DOMParser",
    "Node",
    "Element",
    "HTMLElement",
  ];
  const saved = new Map(
    keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  for (const key of keys)
    globalThis[key] = key === "window" ? dom.window : dom.window[key];
  let app;
  try {
    const output = await build({
      entryPoints: [
        fileURLToPath(new URL("../../src/lib/gtpl.ts", import.meta.url)),
      ],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
      logLevel: "silent",
    });
    const { default: gtpl } = await import(
      `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}#styles`
    );
    const state = {
      items: [{ id: 0 }, { id: 1 }],
      theme: {
        backgroundColor: "rgb(216, 243, 106)",
        color: "rgb(19, 34, 24)",
        width: "120px",
      },
    };
    app = new gtpl.GTpl({
      root: state,
      generator: gtpl.jit.GCompile(
        gtpl.jit.GCodeOptimized(methodTemplate("styles", "gtpl"), { methodAliases: true }),
      ),
    });
    app.addTo(document.querySelector("#app"));
    await app.ready();
    for (const el of document.querySelectorAll(".bench-box"))
      assert.equal(el.style.width, "120px");
    state.theme = {
      backgroundColor: "rgb(118, 96, 202)",
      color: "rgb(255, 255, 255)",
      width: "90px",
    };
    await new Promise((resolve) => setImmediate(resolve));
    for (const el of document.querySelectorAll(".bench-box"))
      for (const [key, value] of Object.entries(state.theme))
        assert.equal(el.style[key], value);
    app.destroy();
    const classes = { items: [{ id: 0 }, { id: 1 }], className: "tone-a" };
    app = new gtpl.GTpl({
      root: classes,
      generator: gtpl.jit.GCompile(
        gtpl.jit.GCodeOptimized(methodTemplate("classes", "gtpl"), { methodAliases: true }),
      ),
    });
    app.addTo(document.querySelector("#app"));
    await app.ready();
    assert.equal(document.querySelectorAll(".bench-box.tone-a").length, 2);
    classes.className = "tone-b";
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(document.querySelectorAll(".bench-box.tone-b").length, 2);
    assert.equal(document.querySelectorAll(".tone-a").length, 0);
  } finally {
    app?.destroy();
    dom.window.close();
    for (const [key, desc] of saved) {
      if (desc) Object.defineProperty(globalThis, key, desc);
      else delete globalThis[key];
    }
  }
});

test("published GTPL benchmarks record optimized aliases and matching bundle checksums", async () => {
  const docs = new URL("../../docs/", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("benchmarks/manifest.json", docs), "utf8"));
  assert.deepEqual(manifest.gtplCompiler, {
    generator: "GCodeOptimized",
    options: { methodAliases: true },
  });
  const checked = new Map();
  const check = async (asset) => {
    if (checked.has(asset.file)) {
      assert.deepEqual(asset, checked.get(asset.file));
      return;
    }
    const bytes = await readFile(new URL(asset.file, docs));
    assert.equal(bytes.length, asset.bytes, asset.file);
    assert.equal(gzipSync(bytes).length, asset.gzipBytes, asset.file);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256, asset.file);
    checked.set(asset.file, asset);
  };
  for (const engine of ["gtpl", "gtpl-jit"]) {
    for (const group of [manifest.frameworks, manifest.gridFrameworks]) {
      const { file, bytes, gzipBytes, sha256 } = group[engine];
      await check({ file, bytes, gzipBytes, sha256 });
    }
    for (const entries of Object.values(manifest.methods)) {
      const entry = entries[engine];
      for (const asset of entry.assets) await check(asset);
      assert.equal(entry.bytes, entry.assets.reduce((sum, asset) => sum + asset.bytes, 0));
      assert.equal(entry.gzipBytes, entry.assets.reduce((sum, asset) => sum + asset.gzipBytes, 0));
    }
  }
});
