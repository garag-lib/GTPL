
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