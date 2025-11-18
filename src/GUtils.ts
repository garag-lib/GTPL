
export function css2obj(css: string): Record<string, string> {
    const obj: Record<string, string> = {};
    let buffer = "";
    let inString: string | null = null;
    let parenDepth = 0;
    const pushRule = (rule: string) => {
        rule = rule.trim();
        if (!rule) return;
        const index = rule.indexOf(":");
        if (index === -1) return;
        const prop = rule.slice(0, index).trim();
        const value = rule.slice(index + 1).trim();
        if (!prop) return;
        // Variables CSS: mantener tal cual
        const key = prop.startsWith("--")
            ? prop
            : prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        obj[key] = value;
    };
    for (let i = 0; i < css.length; i++) {
        const char = css[i];
        // --- string tracking ---
        if (char === '"' || char === "'") {
            if (inString === char) {
                inString = null;
            } else if (!inString) {
                inString = char;
            }
        }
        // --- parens tracking ---
        if (!inString) {
            if (char === "(") parenDepth++;
            if (char === ")") parenDepth--;
        }
        // --- rule boundary: semicolon outside strings & parentheses ---
        if (!inString && parenDepth === 0 && char === ";") {
            pushRule(buffer);
            buffer = "";
            continue;
        }
        buffer += char;
    }
    // Última regla si no acaba con ;
    pushRule(buffer);
    return obj;
}

export function style2css(prop: string) {
    if (prop.startsWith("--")) return prop; // variables CSS
    return prop.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

const staticTypes = new Set([
    "symbol",
    "bigint",
    "undefined",
    "boolean",
    "string",
    "number"
]);

export function isStaticType(val: any): boolean {
    return val === null || staticTypes.has(typeof val);
}

export function isNonProxyableObject(obj: any): boolean {
    if (obj === null) return true;
    const t = typeof obj;
    // 🚫 funciones → no proxificables
    if (t === "function") return true;
    // 🚫 OBJETOS DOM / WINDOW / COLECCIONES DOM → no proxificables
    // (protegido con typeof para que no reviente en Node)
    if (typeof Window !== "undefined" && obj instanceof Window) return true;
    if (typeof Node !== "undefined" && obj instanceof Node) return true;
    if (typeof DOMTokenList !== "undefined" && obj instanceof DOMTokenList) return true;
    if (typeof NodeList !== "undefined" && obj instanceof NodeList) return true;
    if (typeof HTMLCollection !== "undefined" && obj instanceof HTMLCollection) return true;
    // tipos nativos complejos → no proxificables
    if (
        obj instanceof Date ||
        obj instanceof RegExp ||
        obj instanceof Map ||
        obj instanceof Set ||
        obj instanceof WeakMap ||
        obj instanceof WeakSet ||
        obj instanceof ArrayBuffer ||
        ArrayBuffer.isView(obj) // TypedArrays
    ) {
        return true;
    }
    // objetos no extensibles → no proxificables
    if (!Object.isExtensible(obj)) return true;
    return false;
}


export function log(...args: any[]) {
    console.log('%c----------', 'font-weight:bold');
    console.log(...args);
    console.log('%c----------', 'font-weight:bold');
}

export function STACK(message: string, ...rest: any[]) {
    const err = new Error(message);
    console.error("%cSTACK ERROR:", "color:red;font-weight:bold", message);
    log(err.stack, ...rest);
}