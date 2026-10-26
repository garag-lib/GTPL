import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "node:url";
import { templates } from "./templates.mjs";

// Exercise the real compiler + browser DOM + runtime, including ancestor-owned
// data read by a g-for nested inside a g-switch branch.
for (const variant of ["direct", "wrapped-switch", "nested-is"]) {
  test(`${variant}: structural children release inherited row bindings on every switch`, async () => {
    const dom = new JSDOM('<!doctype html><div id="app"></div>');
    const keys = [
      "window",
      "document",
      "DOMParser",
      "Node",
      "Element",
      "HTMLElement",
    ];
    const previous = new Map(
      keys.map((key) => [
        key,
        Object.getOwnPropertyDescriptor(globalThis, key),
      ]),
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
        `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}#${variant}`
      );
      const root = {
        rows: Array.from({ length: 4 }, (_, id) => ({
          id,
          label: `Item ${id}`,
        })),
        tick: 0,
        active: 0,
        view: null,
      };
      let template = templates.gtpl;
      if (variant === "wrapped-switch") {
        root.view = gtpl.jit.GCompile(gtpl.jit.GCode(template));
        template = '<div g-is="view"></div>';
      } else if (variant === "nested-is") {
        root.view = gtpl.jit.GCompile(
          gtpl.jit.GCode(
            '<div><template g-for="rows;index;row"><div class="bench-row"><b>{{row.label}}</b><i>{{tick}}</i></div></template></div>',
          ),
        );
        template = `<div g-switch="active">${Array.from({ length: 12 }, (_, i) => `<section g-case="'${i}'" class="bench-branch"><div g-is="view"></div></section>`).join("")}</div>`;
      }
      const host = document.querySelector("#app");
      app = new gtpl.GTpl({
        root,
        generator: gtpl.jit.GCompile(gtpl.jit.GCode(template)),
      });
      app.addTo(host);
      await app.ready();
      let oldRows = [];
      for (let step = 0; step < 37; step++) {
        root.active = step % 12;
        root.tick = step;
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(host.querySelectorAll(".bench-branch").length, 1);
        assert.equal(host.querySelectorAll(".bench-row").length, 4);
        assert.equal(
          app.GtplChilds.size,
          1,
          "root must own only the active branch, not its rows",
        );
        let branch = [...app.GtplChilds][0];
        if (variant !== "direct") {
          assert.equal(
            branch.GtplChilds.size,
            1,
            "the intermediate component owns its rendered child",
          );
          branch = [...branch.GtplChilds][0];
        }
        assert.equal(
          branch.GtplChilds.size,
          4,
          "the rendering branch owns its four rows",
        );
        assert.equal(
          app.BindTree.tick.me.size,
          4,
          "inactive row bindings must be removed",
        );
        for (const old of oldRows) assert.equal(old.isDestroyed, true);
        oldRows = [...branch.GtplChilds];
        assert.deepEqual(
          [...host.querySelectorAll(".bench-row i")].map(
            (node) => node.textContent,
          ),
          Array(4).fill(String(step)),
        );
      }
      // A collection replacement must remove rows from the same rendering owner.
      root.rows = [{ id: 0, label: "Item 0" }];
      await new Promise((resolve) => setImmediate(resolve));
      let owner = [...app.GtplChilds][0];
      if (variant !== "direct") owner = [...owner.GtplChilds][0];
      assert.equal(owner.GtplChilds.size, 1);
      assert.equal(app.BindTree.tick.me.size, 1);
      app.destroy();
      app = null;
      assert.equal(host.querySelectorAll(".bench-row").length, 0);
      assert.equal(host.childNodes.length, 0, host.innerHTML);
    } finally {
      app?.destroy();
      dom.window.close();
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    }
  });
}
