
export function css2obj(css: string): Record<string, string> {
    const obj: Record<string, string> = {};
    const s = css.toLowerCase()
        .replace(/-(.)/g, (m, g) => g.toUpperCase())
        .replace(/;\s?$/g, "")
        .split(/:|;/g);
    for (let i = 0, n = s.length; i < n; i += 2) {
        obj[s[i].replace(/\s/g, "")] = s[i + 1].replace(/^\s+|\s+$/g, "");
    }
    return obj;
}

export function style2css(prop: any) {
    return prop.replace(/([a-z])([A-Z])/g, '$1-$2').toLocaleLowerCase();
}

const typeArray = ['symbol', 'bigint', 'undefined', 'boolean', 'string', 'number'];

export function isStaticType(val: any): boolean {
    if (val === null || val === undefined)
        return true;
    const type = typeof val;
    return typeArray.includes(type);
}

function logArray(array: any[], level: number = 0): void {
    const prefix = '  '.repeat(level); // Indentation for nested arrays
    console.log(`${prefix}Array [`);
    array.forEach(item => {
        if (Array.isArray(item)) {
            logArray(item, level + 1);
        } else if (typeof item === 'object' && item !== null) {
            logObject(item, level + 1);
        } else {
            console.log(`${prefix}  ${item}`);
        }
    });
    console.log(`${prefix}]`);
}

function logObject(obj: any, level: number = 0): void {
    const prefix = '  '.repeat(level); // Indentation for nested objects
    console.log(`${prefix}{`);
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            const value = obj[key];
            if (Array.isArray(value)) {
                console.log(`${prefix}  ${key}: `);
                logArray(value, level + 1);
            } else if (typeof value === 'object' && value !== null) {
                console.log(`${prefix}  ${key}: `);
                logObject(value, level + 1);
            } else {
                console.log(`${prefix}  ${key}: ${value}`);
            }
        }
    }
    console.log(`${prefix}}`);
}

export function log(...args: any): void {
    console.log('%c----------', 'font-weight:bold');
    args.forEach((arg: any) => {
        if (Array.isArray(arg)) {
            logArray(arg);
        } else if (typeof arg === 'object' && arg !== null) {
            logObject(arg);
        } else {
            console.log(arg);
        }
    });
    console.log('%c----------', 'font-weight:bold');
}

export function STACK(...args: any) {
    //const functionName = log.caller?.name || arguments.callee.caller?.name;
    args.push((new Error(args.shift())).stack);
    log(...args);
}
