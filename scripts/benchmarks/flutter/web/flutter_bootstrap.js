{{flutter_js}}
{{flutter_build_config}}
const flutterGridBase = new URL('.', document.currentScript.src);
globalThis.startFlutterGrid = (hostElement) => {
  const config = {
    hostElement,
    renderer: 'canvaskit',
    canvasKitVariant: 'full',
    canvasKitBaseUrl: new URL('canvaskit/', flutterGridBase).href,
    assetBase: flutterGridBase.href,
    entrypointBaseUrl: flutterGridBase.href,
    fontFallbackBaseUrl: new URL('assets/', flutterGridBase).href,
  };
  return new Promise((resolve, reject) => {
    _flutter.loader.load({ config,
      onEntrypointLoaded: async (initializer) => {
        try {
          const runner = await initializer.initializeEngine(config);
          await runner.runApp();
          resolve();
        } catch (error) { reject(error); }
      },
    }).catch(reject);
  });
};
