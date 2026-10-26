const status = document.querySelector("#isolation-status");
try {
  if (!isSecureContext || !("serviceWorker" in navigator))
    throw new Error(
      "Este navegador no permite activar la medición aquí. Prueba Chrome o Edge mediante HTTPS, o usa el servidor local aislado.",
    );
  const registration = await navigator.serviceWorker.register(
    new URL("./isolation-worker.js", import.meta.url),
    { scope: "./", updateViaCache: "none" },
  );
  const worker =
    registration.installing ?? registration.waiting ?? registration.active;
  if (!worker) throw new Error("No se pudo iniciar el modo de memoria.");
  if (worker.state !== "activated")
    await new Promise((resolve, reject) => {
      worker.addEventListener("statechange", () => {
        if (worker.state === "activated") resolve();
        if (worker.state === "redundant")
          reject(new Error("No se pudo activar el modo de memoria."));
      });
    });
  const next = new URL("./lab.html", import.meta.url);
  next.search = location.search;
  next.searchParams.set("memory", "1");
  location.replace(next);
} catch (error) {
  status.textContent = error.message;
}
