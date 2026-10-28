import { localizedError, errorMessage, getLanguage, setLanguage, translateDOM, onLanguageChange } from "./i18n.js";

const status = document.querySelector("#isolation-status");
const language = document.querySelector("#language");
let failure;
function render() {
  translateDOM();
  language.value = getLanguage();
  if (failure) status.textContent = errorMessage(failure);
  const normal = new URL("../benchmarks.html", location.href);
  normal.searchParams.set("lang", getLanguage());
  document.querySelector("#normal-mode").href = normal;
}
language.addEventListener("change", () => setLanguage(language.value));
onLanguageChange(render);
render();
try {
  if (!isSecureContext || !("serviceWorker" in navigator))
    throw localizedError(
      "This browser cannot enable memory measurement here. Try Chrome or Edge over HTTPS, or use the isolated local server.",
      "Este navegador no permite activar la medición aquí. Prueba Chrome o Edge mediante HTTPS, o usa el servidor local aislado.",
    );
  const registration = await navigator.serviceWorker.register(
    new URL("./isolation-worker.js", import.meta.url),
    { scope: "./", updateViaCache: "none" },
  );
  const worker = registration.installing ?? registration.waiting ?? registration.active;
  if (!worker) throw localizedError("Could not start memory mode.", "No se pudo iniciar el modo de memoria.");
  if (worker.state !== "activated")
    await new Promise((resolve, reject) => {
      worker.addEventListener("statechange", () => {
        if (worker.state === "activated") resolve();
        if (worker.state === "redundant") reject(localizedError("Could not activate memory mode.", "No se pudo activar el modo de memoria."));
      });
    });
  const next = new URL("./lab.html", import.meta.url);
  next.search = location.search;
  next.searchParams.set("lang", getLanguage());
  next.searchParams.set("memory", "1");
  location.replace(next);
} catch (error) {
  failure = error;
  render();
}
