import test from "node:test";
import assert from "node:assert/strict";
import {
  createSampleExecutor,
  sampleTimeoutMs,
  SAMPLE_TIMEOUT,
} from "../../docs/benchmarks/sample-executor.js";

test("the sample clock continues after a memory phase while a module import is pending", async () => {
  const seen = [];
  let release,
    aborted = false;
  const run = createSampleExecutor(
    async (id, config, signal, progress) => {
      signal.addEventListener("abort", () => {
        aborted = true;
      });
      progress({
        kind: "memory",
        phase: "ejecutor vacío",
        index: 1,
        total: 3,
        reading: false,
        timeoutMs: 30000,
      });
      progress({ kind: "sample", phase: "cargando plantilla" });
      return new Promise((resolve) => {
        release = resolve;
      });
    },
    { timeoutFor: () => 80, heartbeatMs: 5 },
  );
  await assert.rejects(
    run("svelte", { memory: true }, new AbortController().signal, (p) =>
      seen.push(p),
    ),
    { code: SAMPLE_TIMEOUT, phase: "cargando plantilla" },
  );
  const loading = seen.filter((p) => p.phase === "cargando plantilla");
  assert.ok(
    loading.length > 2,
    "heartbeat must survive the gap between iframe progress messages",
  );
  assert.ok(loading.at(-1).sampleElapsedMs > loading[0].sampleElapsedMs);
  assert.ok(
    aborted,
    "the timed out iframe is disposed through its abort signal",
  );
  const count = seen.length;
  release({ validated: true });
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(seen.length, count);
});
test("all phases share one sample deadline, and an exhausted sample does not prevent the next", async () => {
  const seen = [];
  const run = createSampleExecutor(
    async (id, c, s, p) => {
      if (id === "next") return { validated: true };
      for (let i = 0; i < 5; i++) {
        p({ kind: "memory", phase: "phase " + i, reading: true });
        await new Promise((r) => setTimeout(r, 20));
        if (s.aborted) throw s.reason;
      }
      return { validated: true };
    },
    { timeoutFor: () => 55, heartbeatMs: 5 },
  );
  await assert.rejects(
    run("svelte", {}, new AbortController().signal, (p) => seen.push(p)),
    { code: SAMPLE_TIMEOUT },
  );
  assert.ok(seen.at(-1).sampleElapsedMs >= 40);
  assert.deepEqual(await run("next", {}, new AbortController().signal), {
    validated: true,
  });
});
test("the allowance includes loading/rendering plus all memory phases rather than 30 seconds per sample", () => {
  assert.equal(sampleTimeoutMs({ memory: false }), 120000);
  assert.equal(
    sampleTimeoutMs({ memory: true, method: "switch", retention: false }),
    210000,
  );
  assert.equal(
    sampleTimeoutMs({ memory: true, method: "switch", retention: true }),
    240000,
  );
});
test("Stop cancels the sample and its heartbeat without retrying or leaving a timer", async () => {
  const controller = new AbortController();
  let calls = 0,
    updates = 0;
  const run = createSampleExecutor(
    async (id, c, s) => {
      calls++;
      await new Promise((resolve, reject) =>
        s.addEventListener("abort", () => reject(s.reason)),
      );
    },
    { timeoutFor: () => 100, heartbeatMs: 5 },
  );
  const result = run("svelte", {}, controller.signal, () => updates++);
  await new Promise((r) => setTimeout(r, 10));
  controller.abort();
  await assert.rejects(result, { name: "AbortError" });
  const count = updates;
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(updates, count);
  assert.equal(calls, 1);
});

test("blocking work cannot return an accepted result after the sample deadline before the timer fires", async () => {
  let aborted;
  const run = createSampleExecutor(
    (id, config, signal, progress) => {
      signal.addEventListener("abort", () => {
        aborted = signal.reason;
      });
      progress({ kind: "sample", phase: "compilando plantilla" });
      const start = performance.now();
      while (performance.now() - start < 25) {
        /* simulate synchronous compilation */
      }
      return { validated: true };
    },
    { timeoutFor: () => 10, heartbeatMs: 5 },
  );
  await assert.rejects(
    run("svelte", {}, new AbortController().signal),
    (error) => {
      assert.equal(error.code, SAMPLE_TIMEOUT);
      assert.equal(error.phase, "compilando plantilla");
      assert.equal(error.timeoutMs, 10);
      assert.ok(error.elapsedMs >= 25);
      assert.equal(
        aborted,
        error,
        "the iframe receives the same timeout reason",
      );
      return true;
    },
  );
});
