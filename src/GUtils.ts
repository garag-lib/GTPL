
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
    if (val == null)
        return true;
    const type = typeof val;
    return typeArray.includes(type);
}

export function log(...args: any): void {
    console.log('%c----------', 'font-weight:bold');
    args.forEach((arg: any) => {
        console.log(arg);
    });
    console.log('%c----------', 'font-weight:bold');
}

export function STACK(...args: any) {
    //const functionName = log.caller?.name || arguments.callee.caller?.name;
    args.push((new Error(args.shift())).stack);
    log(...args);
}

export function activateMemoryLeakObserver() {
    const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
            console.warn('Posible memory leak:', entry);
        }
    });
    observer.observe({ entryTypes: ['measure'] });
}

