import { t } from "./i18n.js";

// Phase identifiers remain stable in recorded samples; only their labels change.
const phases = {
  "preparando ejecutor": "preparing runner",
  "ejecutor vacío": "empty runner",
  "cargando plantilla precompilada": "loading precompiled template",
  "preparando estado del caso": "preparing case state",
  "montando estado inicial": "mounting initial state",
  "definiciones y estado inicial": "definitions and initial state",
  "creando vista elegida": "creating selected view",
  "retirando vista": "removing view",
  "recreando vista": "recreating view",
  "recorriendo ramas": "visiting branches",
  "actualizando vista": "updating view",
  "solo la vista elegida": "selected view only",
  "retirada tras visitas": "removed after visits",
  "lista tras operaciones": "list after operations",
  "vista tras actualizaciones": "view after updates",
  "liberando vista y bindings": "releasing view and bindings",
};

export function localizePhase(phase, language) {
  if (phase == null) return "";
  if (language === "en") return phases[phase] ?? phase;
  if (language === "es") return phase;
  return t(phases[phase] ?? phase, phase);
}
