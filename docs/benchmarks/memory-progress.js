export function renderMemoryProgress(
  { status, live, bar, completed },
  prefix,
  progress,
) {
  const activeSample = Number.isFinite(progress.sampleElapsedMs);
  const pendingRead = progress.kind === "memory" && progress.reading;
  const clock = activeSample
    ? ` · muestra: ${Math.floor(progress.sampleElapsedMs / 1000)} s / ${progress.sampleTimeoutMs / 1000} s`
    : "";
  const phase =
    progress.kind === "memory-fallback"
      ? `la API de memoria no responde; ${progress.state === "timeout" ? "repitiendo muestra sin lecturas" : "continuando sin lecturas"}. Memoria: N/D.`
      : progress.kind === "memory"
        ? `memoria ${progress.index}/${progress.total}: ${progress.phase} · ${pendingRead ? `esperando ${Math.floor((progress.waitedMs ?? 0) / 1000)} s (límite por lectura ${progress.timeoutMs / 1000} s)` : "lectura terminada"}`
        : progress.phase;
  const message = `${prefix}${clock} · ${phase}`;
  status.textContent = live.textContent = message;
  bar.setAttribute("aria-valuetext", message);
  if (activeSample || pendingRead) bar.removeAttribute("value");
  else bar.value = completed;
}
