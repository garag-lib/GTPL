import { localizedError, t, formatNumber } from "./i18n.js";
import { localizePhase } from "./progress-labels.js";
import { MEMORY_TIMEOUT_MS, memoryPhaseCount } from "./memory.js";
export const SAMPLE_TIMEOUT = "SAMPLE_TIMEOUT";
export const OPERATION_TIMEOUT_MS = 120_000;

// Loading and rendering keep their own allowance in addition to all memory reads.
export function sampleTimeoutMs(config) {
  return (
    OPERATION_TIMEOUT_MS +
    (config.memory ? memoryPhaseCount(config) * MEMORY_TIMEOUT_MS : 0)
  );
}

// One clock covers the complete logical sample, including a memory fallback.
// Its heartbeat continues between iframe messages (imports, layout and cleanup).
export function createSampleExecutor(
  execute,
  { timeoutFor = sampleTimeoutMs, heartbeatMs = 1000 } = {},
) {
  return (id, config, signal, onProgress = () => {}) =>
    new Promise((resolve, reject) => {
      const controller = new AbortController();
      const started = performance.now(),
        timeoutMs = timeoutFor(config);
      let finished = false,
        phaseStarted = started;
      let progress = { kind: "sample", phase: "preparando ejecutor" };
      let timer, heartbeat;
      const elapsed = () => performance.now() - started;
      const timeoutError = () =>
        Object.assign(
          localizedError(`The sample exceeded ${formatNumber(timeoutMs / 1000, { maximumFractionDigits: 3 })} s during “${localizePhase(progress.phase, "en")}”; discarded, continuing.`, `La muestra superó ${formatNumber(timeoutMs / 1000, { maximumFractionDigits: 3 })} s en «${localizePhase(progress.phase, "es")}»; se descarta y se continúa.`),
          {
            name: "SampleTimeoutError",
            code: SAMPLE_TIMEOUT,
            phase: progress.phase,
            timeoutMs,
            elapsedMs: elapsed(),
          },
        );
      const cleanup = () => {
        clearTimeout(timer);
        clearInterval(heartbeat);
        signal.removeEventListener("abort", abort);
      };
      const finish = (error, result) => {
        if (finished) return;
        finished = true;
        cleanup();
        if (error) {
          controller.abort(error);
          reject(error);
        } else resolve(result);
      };
      const abort = () =>
        finish(
          signal.reason ??
            new DOMException(t("Run stopped.", "Ejecución detenida."), "AbortError"),
        );
      const update = () => {
        if (finished) return;
        onProgress({
          ...progress,
          waitedMs: performance.now() - phaseStarted,
          sampleElapsedMs: elapsed(),
          sampleTimeoutMs: timeoutMs,
        });
      };
      const receive = (next) => {
        if (finished) return;
        progress = next;
        phaseStarted = performance.now();
        update();
      };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) {
        abort();
        return;
      }
      timer = setTimeout(() => finish(timeoutError()), timeoutMs);
      heartbeat = setInterval(update, heartbeatMs);
      update();
      Promise.resolve()
        .then(() => {
          if (finished) return;
          return execute(id, config, controller.signal, receive);
        })
        .then(
          // An import/evaluation can block the event loop beyond the deadline.
          // Its completion microtask runs before a delayed setTimeout callback.
          (result) =>
            elapsed() >= timeoutMs
              ? finish(timeoutError())
              : finish(null, result),
          (error) => finish(error),
        );
    });
}
