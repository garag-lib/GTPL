export const MEMORY_TIMEOUT_MS = 30_000;
export const MEMORY_TIMEOUT = "MEMORY_TIMEOUT";

export function memoryPhaseCount(config) {
  return config.method === "if" ||
    (config.method === "switch" && config.retention)
    ? 4
    : 3;
}

export async function readMemory({ timeoutMs = MEMORY_TIMEOUT_MS } = {}) {
  if (
    !globalThis.crossOriginIsolated ||
    typeof performance.measureUserAgentSpecificMemory !== "function"
  ) {
    return {
      totalBytes: null,
      status: "unsupported",
      error: "La API de memoria no está disponible.",
    };
  }
  const started = performance.now();
  let timer;
  try {
    const result = await Promise.race([
      Promise.resolve().then(() =>
        performance.measureUserAgentSpecificMemory(),
      ),
      new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          const error = new Error(
            `La API de memoria no respondió en ${timeoutMs / 1000} s.`,
          );
          Object.assign(error, {
            name: "MemoryTimeoutError",
            code: MEMORY_TIMEOUT,
            timeoutMs,
          });
          reject(error);
        }, timeoutMs);
      }),
    ]);
    if (!Number.isFinite(result.bytes))
      throw new Error("La API devolvió una lectura de memoria inválida.");
    const breakdown = result.breakdown ?? [];
    const exclusive = breakdown.filter(
      (part) =>
        part.attribution?.length &&
        part.attribution.every((item) => item.url === location.href),
    );
    return {
      totalBytes: result.bytes,
      exclusiveBytes: exclusive.length
        ? exclusive.reduce((n, part) => n + part.bytes, 0)
        : null,
      breakdown,
      status: "measured",
      durationMs: performance.now() - started,
    };
  } catch (error) {
    if (error.code === MEMORY_TIMEOUT) throw error;
    return {
      totalBytes: null,
      status: "error",
      error: error.message,
      durationMs: performance.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

// A pending native measurement cannot be cancelled. Dispose its iframe before
// timing a fresh run, and stop requesting memory for the rest of this comparison.
export function createMemoryExecutor(execute, onUnavailable = () => {}) {
  let failure;
  async function withoutMemory(id, config, signal, onProgress, state) {
    onProgress?.({
      kind: "memory-fallback",
      phase: failure.phase,
      state,
      timeoutMs: failure.timeoutMs,
    });
    const result = await execute(
      id,
      { ...config, memory: false },
      signal,
      onProgress,
    );
    const { engine: failureEngine, ...details } = failure;
    result.memoryStatus = { ...details, failureEngine, state, requested: true };
    return result;
  }
  return async (id, config, signal, onProgress) => {
    if (!config.memory) return execute(id, config, signal, onProgress);
    if (failure)
      return withoutMemory(id, config, signal, onProgress, "skipped");
    try {
      return await execute(id, config, signal, onProgress);
    } catch (error) {
      if (error.code !== MEMORY_TIMEOUT || signal.aborted) throw error;
      failure = {
        engine: id,
        code: error.code,
        phase: error.phase,
        timeoutMs: error.timeoutMs,
        message: error.message,
      };
      onUnavailable(failure);
      return withoutMemory(id, config, signal, onProgress, "timeout");
    }
  };
}
