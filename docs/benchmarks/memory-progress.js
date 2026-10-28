import { t, formatNumber } from "./i18n.js";
import { localizePhase } from "./progress-labels.js";

export function renderMemoryProgress(
  { status, live, bar, completed },
  prefix,
  progress,
) {
  const activeSample = Number.isFinite(progress.sampleElapsedMs);
  const pendingRead = progress.kind === "memory" && progress.reading;
  const seconds = (ms) => formatNumber(ms / 1000, { maximumFractionDigits: 3 });
  const clock = activeSample
    ? t(
        ` · sample: ${formatNumber(Math.floor(progress.sampleElapsedMs / 1000))} s / ${seconds(progress.sampleTimeoutMs)} s`,
        ` · muestra: ${formatNumber(Math.floor(progress.sampleElapsedMs / 1000))} s / ${seconds(progress.sampleTimeoutMs)} s`,
      )
    : "";
  const phase =
    progress.kind === "memory-fallback"
      ? t(
          `memory API not responding; ${progress.state === "timeout" ? "retrying sample without readings" : "continuing without readings"}. Memory: N/A.`,
          `la API de memoria no responde; ${progress.state === "timeout" ? "repitiendo muestra sin lecturas" : "continuando sin lecturas"}. Memoria: N/D.`,
        )
      : progress.kind === "memory"
        ? t(
            `memory ${progress.index}/${progress.total}: ${localizePhase(progress.phase)} · ${pendingRead ? `waiting ${formatNumber(Math.floor((progress.waitedMs ?? 0) / 1000))} s (per-reading limit ${seconds(progress.timeoutMs)} s)` : "reading complete"}`,
            `memoria ${progress.index}/${progress.total}: ${localizePhase(progress.phase)} · ${pendingRead ? `esperando ${formatNumber(Math.floor((progress.waitedMs ?? 0) / 1000))} s (límite por lectura ${seconds(progress.timeoutMs)} s)` : "lectura terminada"}`,
          )
        : localizePhase(progress.phase);
  const message = `${prefix}${clock} · ${phase}`;
  status.textContent = live.textContent = message;
  bar.setAttribute("aria-valuetext", message);
  if (activeSample || pendingRead) bar.removeAttribute("value");
  else bar.value = completed;
}
