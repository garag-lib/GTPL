import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { renderMemoryProgress } from "../../docs/benchmarks/memory-progress.js";

test("a pending memory read stays visibly active next to the runner until it settles", () => {
  const dom = new JSDOM(
    '<p id="status"></p><span id="live"></span><progress value="1" max="6"></progress>',
  );
  try {
    const status = dom.window.document.querySelector("#status"),
      live = dom.window.document.querySelector("#live"),
      bar = dom.window.document.querySelector("progress");
    const targets = { status, live, bar, completed: 1 };
    const phase = {
      kind: "memory",
      phase: "definiciones y estado inicial",
      index: 2,
      total: 3,
      reading: true,
      timeoutMs: 30000,
    };
    renderMemoryProgress(targets, "Svelte · muestra 2 de 3", {
      ...phase,
      waitedMs: 17000,
    });
    assert.equal(live.textContent, status.textContent);
    assert.match(live.textContent, /memoria 2\/3.*definiciones.*17 s.*30 s/);
    assert.equal(
      bar.hasAttribute("value"),
      false,
      "pending browser work has no fabricated completion percentage",
    );
    renderMemoryProgress(targets, "Svelte · muestra 2 de 3", {
      ...phase,
      reading: false,
    });
    assert.equal(
      bar.value,
      1,
      "only completed samples count toward overall progress",
    );
    assert.match(live.textContent, /lectura terminada/);
    assert.equal(bar.getAttribute("aria-valuetext"), status.textContent);
    renderMemoryProgress(targets, "Svelte · muestra 2 de 3", {
      kind: "memory-fallback",
      state: "timeout",
    });
    assert.match(live.textContent, /sin lecturas.*N\/D/);
    assert.equal(bar.hasAttribute("value"), true);
  } finally {
    dom.window.close();
  }
});

test("the sample counter keeps advancing between a completed memory read and the next phase", () => {
  const dom = new JSDOM(
    '<p id="status"></p><span id="live"></span><progress value="0" max="6"></progress>',
  );
  try {
    const targets = {
      status: dom.window.document.querySelector("#status"),
      live: dom.window.document.querySelector("#live"),
      bar: dom.window.document.querySelector("progress"),
      completed: 0,
    };
    renderMemoryProgress(targets, "Svelte · muestra 1 de 3", {
      kind: "memory",
      phase: "ejecutor vacío",
      index: 1,
      total: 3,
      reading: false,
      sampleElapsedMs: 5000,
      sampleTimeoutMs: 210000,
    });
    assert.match(
      targets.live.textContent,
      /muestra: 5 s \/ 210 s.*lectura terminada/,
    );
    assert.equal(
      targets.bar.hasAttribute("value"),
      false,
      "the sample is still in flight",
    );
    renderMemoryProgress(targets, "Svelte · muestra 1 de 3", {
      kind: "sample",
      phase: "cargando plantilla precompilada",
      sampleElapsedMs: 9000,
      sampleTimeoutMs: 210000,
    });
    assert.match(
      targets.live.textContent,
      /muestra: 9 s \/ 210 s.*cargando plantilla/,
    );
    assert.doesNotMatch(targets.live.textContent, /undefined/);
    assert.equal(targets.bar.hasAttribute("value"), false);
  } finally {
    dom.window.close();
  }
});
