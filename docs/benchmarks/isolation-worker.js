// Opt-in, network-only isolation for the benchmark directory. Documentation
// outside this scope remains untouched. Nothing is stored in a cache.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET")
    return;
  if (
    event.request.cache === "only-if-cached" &&
    event.request.mode !== "same-origin"
  )
    return;
  event.respondWith(
    (async () => {
      const response = await fetch(event.request, { cache: "no-store" });
      if (!response.ok || response.type === "opaque") return response;
      const headers = new Headers(response.headers);
      headers.set("Cross-Origin-Opener-Policy", "same-origin");
      headers.set("Cross-Origin-Embedder-Policy", "require-corp");
      headers.set("Cross-Origin-Resource-Policy", "same-origin");
      headers.set("Cache-Control", "no-store");
      headers.delete("content-encoding");
      headers.delete("content-length");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    })(),
  );
});
