const storageKey = "gtpl-benchmark-language";
const subscribers = new Set();
const numberFormatters = new Map();

function initialLanguage() {
  try {
    const query = new URL(globalThis.location.href).searchParams.get("lang");
    if (query === "en" || query === "es") return query;
  } catch { /* Node tests and non-browser imports have no location. */ }
  try {
    const saved = globalThis.localStorage?.getItem(storageKey);
    if (saved === "en" || saved === "es") return saved;
  } catch { /* Storage may be unavailable in private or embedded contexts. */ }
  return "es";
}

let language = initialLanguage();

export function getLanguage() {
  return language;
}

export function getLocale() {
  return language === "en" ? "en-US" : "es-ES";
}

export function t(en, es) {
  return language === "en" ? en : es;
}

export function formatNumber(value, options = {}) {
  const key = `${getLocale()}:${JSON.stringify(options)}`;
  if (!numberFormatters.has(key))
    numberFormatters.set(key, new Intl.NumberFormat(getLocale(), {
      maximumFractionDigits: 2,
      ...options,
    }));
  return numberFormatters.get(key).format(value);
}

export function localizedError(en, es) {
  return Object.assign(new Error(t(en, es)), { translations: { en, es } });
}

/** Preserve recorded errors, translating only their current UI representation. */
export function errorMessage(error) {
  return error.translations?.[language] ?? error.message;
}

/** Translate only explicitly marked UI, preserving controls and benchmark data. */
export function translateDOM(root = globalThis.document) {
  if (!root) return;
  const elements = [...root.querySelectorAll("*")];
  if (root.nodeType === 1) elements.unshift(root);
  for (const element of elements) {
    if (element.hasAttribute("data-i18n-en")) {
      if (!element.hasAttribute("data-i18n-es"))
        element.setAttribute("data-i18n-es", element.textContent);
      element.textContent = element.getAttribute(`data-i18n-${language}`);
    }
    for (const attribute of [...element.attributes]) {
      if (!attribute.name.startsWith("data-i18n-") || !attribute.name.endsWith("-en")) continue;
      const name = attribute.name.slice(10, -3);
      if (!name) continue;
      const spanish = `data-i18n-${name}-es`;
      if (!element.hasAttribute(spanish))
        element.setAttribute(spanish, element.getAttribute(name) ?? "");
      element.setAttribute(name, element.getAttribute(`data-i18n-${name}-${language}`));
    }
  }
  if (root.nodeType === 9) root.documentElement.lang = language;
}

export function setLanguage(next) {
  if (next !== "en" && next !== "es") throw new RangeError("Unsupported language");
  const changed = next !== language;
  language = next;
  try { globalThis.localStorage?.setItem(storageKey, language); } catch { /* Optional preference. */ }
  try {
    const url = new URL(globalThis.location.href);
    url.searchParams.set("lang", language);
    globalThis.history.replaceState(globalThis.history.state, "", url);
  } catch { /* Optional URL persistence; imports also work outside a window. */ }
  if (!changed) return;
  translateDOM();
  for (const callback of subscribers) callback(language);
}

export function onLanguageChange(callback) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}
