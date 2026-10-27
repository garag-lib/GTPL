export function renderMemoryProgress(
  { status, live, bar, completed },
  prefix,
  progress,
) {
  const pending = progress.kind === "memory" && progress.reading;
  const message =
    progress.kind === "memory-fallback"
      ? `${prefix} · la API de memoria no responde; ${progress.state === "timeout" ? "repitiendo muestra sin lecturas" : "continuando sin lecturas"}. Memoria: N/D.`
      : `${prefix} · memoria ${progress.index}/${progress.total}: ${progress.phase} · ${pending ? `esperando ${Math.floor((progress.waitedMs ?? 0) / 1000)} s (límite ${progress.timeoutMs / 1000} s)` : "lectura terminada"}`;
  status.textContent = live.textContent = message;
  bar.setAttribute("aria-valuetext", message);
  if (pending) bar.removeAttribute("value");
  else bar.value = completed;
}
