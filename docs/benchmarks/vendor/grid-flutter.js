// Flutter is compiled independently; see scripts/benchmarks/build-flutter.mjs.
let runtime;
function loadRuntime(host) {
  if (!runtime) runtime = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('./flutter/flutter_bootstrap.js', import.meta.url).href;
    script.onerror = () => reject(new Error('Could not load Flutter Web.'));
    script.onload = async () => {
      try {
        await globalThis.startFlutterGrid(host);
        if (!globalThis.flutterGridApi) throw new Error('Flutter grid API unavailable.');
        resolve(globalThis.flutterGridApi);
      } catch (error) { reject(error); }
    };
    document.head.append(script);
  });
  return runtime;
}

export function createAdapter() {
  let api, surface;
  return {
    renderer: 'Flutter Web · dart2js · CanvasKit',
    frameDriven: true,
    async mount(host, { columns, rows }) {
      // Keep one engine host alive across the discarded warm-up and size sweep.
      surface = globalThis.flutterGridHost ??= document.createElement('div');
      surface.style.cssText = 'height:154px;position:relative;width:100%;overflow:hidden';
      host.append(surface);
      api = await loadRuntime(surface);
      await api.mount(columns, rows);
    },
    update({ indices, values }) { return api.update(indices, values); },
    snapshot(indices) { return api.snapshot(indices ?? null); },
    async destroy() { if (api) await api.destroy(); api = null; surface = null; },
  };
}
