import test from "node:test";
import assert from "node:assert/strict";
import { readMemory } from "../../docs/benchmarks/method-runner.js";
import {
  createMemoryExecutor,
  memoryPhaseCount,
} from "../../docs/benchmarks/memory.js";

function environment(t, measure) {
  const saved = ["crossOriginIsolated", "location"].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]);
  const original = Object.getOwnPropertyDescriptor(
    performance,
    "measureUserAgentSpecificMemory",
  );
  Object.defineProperty(globalThis, "crossOriginIsolated", {
    value: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, "location", {
    value: { href: "https://example.test/runner.html" },
    configurable: true,
  });
  Object.defineProperty(performance, "measureUserAgentSpecificMemory", {
    value: measure,
    configurable: true,
  });
  t.after(() => {
    for (const [key, desc] of saved)
      if (desc) Object.defineProperty(globalThis, key, desc);
      else delete globalThis[key];
    if (original)
      Object.defineProperty(
        performance,
        "measureUserAgentSpecificMemory",
        original,
      );
    else delete performance.measureUserAgentSpecificMemory;
  });
}

test("an unresolved browser memory request has its own deadline", async (t) => {
  let calls = 0;
  environment(t, () => {
    calls++;
    return new Promise(() => {});
  });
  const outcome = await Promise.race([
    readMemory({ timeoutMs: 15 }).then(
      (value) => ({ value }),
      (error) => ({ code: error.code, timeoutMs: error.timeoutMs }),
    ),
    new Promise((resolve) => setTimeout(() => resolve({ blocked: true }), 100)),
  ]);
  assert.equal(outcome.code, "MEMORY_TIMEOUT");
  assert.equal(outcome.timeoutMs, 15);
  assert.equal(calls, 1);
});

test("a completed memory request preserves real attribution and signed-delta inputs", async (t) => {
  const breakdown = [
    { bytes: 300, attribution: [{ url: "https://example.test/runner.html" }] },
    { bytes: 700, attribution: [] },
  ];
  environment(t, async () => ({ bytes: 1000, breakdown }));
  const result = await readMemory({ timeoutMs: 100 });
  assert.equal(result.totalBytes, 1000);
  assert.equal(result.exclusiveBytes, 300);
  assert.deepEqual(result.breakdown, breakdown);
});

test("a browser rejection arriving after the deadline is still handled", async (t) => {
  environment(
    t,
    () =>
      new Promise((resolve, reject) =>
        setTimeout(() => reject(new Error("late browser failure")), 30),
      ),
  );
  await assert.rejects(readMemory({ timeoutMs: 5 }), {
    code: "MEMORY_TIMEOUT",
  });
  await new Promise((resolve) => setTimeout(resolve, 45));
});

test("memory API errors remain missing readings rather than zero bytes", async (t) => {
  environment(t, async () => {
    throw new DOMException("No isolation", "SecurityError");
  });
  const result = await readMemory({ timeoutMs: 100 });
  assert.equal(result.totalBytes, null);
  assert.equal(result.status, "error");
  assert.equal(result.error, "No isolation");
});

test("a memory timeout retries a fresh sample and disables reads for subsequent engines and rounds", async () => {
  const calls = [],
    warnings = [];
  const execute = createMemoryExecutor(
    async (id, config) => {
      calls.push({ id, memory: config.memory });
      if (config.memory)
        throw Object.assign(new Error("Browser did not respond"), {
          code: "MEMORY_TIMEOUT",
          phase: "definiciones y estado inicial",
          timeoutMs: 30000,
        });
      return { validated: true, metrics: { activeBytes: null, mountMs: 7 } };
    },
    (warning) => warnings.push(warning),
  );
  const signal = new AbortController().signal;
  const first = await execute("gtpl", { memory: true }, signal);
  const other = await execute("react", { memory: true }, signal);
  const nextRound = await execute("gtpl", { memory: true }, signal);
  assert.deepEqual(calls, [
    { id: "gtpl", memory: true },
    { id: "gtpl", memory: false },
    { id: "react", memory: false },
    { id: "gtpl", memory: false },
  ]);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].phase, "definiciones y estado inicial");
  assert.equal(first.memoryStatus.state, "timeout");
  assert.equal(other.memoryStatus.state, "skipped");
  assert.equal(other.memoryStatus.failureEngine, "gtpl");
  assert.equal(nextRound.memoryStatus.state, "skipped");
  assert.equal(first.metrics.activeBytes, null);
  assert.equal(first.metrics.mountMs, 7);
  assert.ok(first.validated && other.validated && nextRound.validated);
});

test("ordinary benchmark errors and Stop do not trigger a memory retry", async () => {
  for (const abort of [false, true]) {
    const controller = new AbortController();
    let calls = 0,
      warnings = 0;
    const error = Object.assign(
      new Error(abort ? "Stopped" : "DOM validation failed"),
      { code: abort ? "MEMORY_TIMEOUT" : "INVALID_DOM" },
    );
    const execute = createMemoryExecutor(
      async () => {
        calls++;
        if (abort) controller.abort();
        throw error;
      },
      () => warnings++,
    );
    await assert.rejects(
      execute("gtpl", { memory: true }, controller.signal),
      (e) => e === error,
    );
    assert.equal(calls, 1);
    assert.equal(warnings, 0);
  }
});

test("memory progress includes the removal phase only for relevant methods", () => {
  assert.equal(memoryPhaseCount({ method: "switch", retention: false }), 3);
  assert.equal(memoryPhaseCount({ method: "switch", retention: true }), 4);
  assert.equal(memoryPhaseCount({ method: "if", retention: false }), 4);
  assert.equal(memoryPhaseCount({ method: "for", retention: true }), 3);
});
