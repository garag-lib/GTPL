
export function css2obj(css: string) {
    var obj: any = {}, s = css.toLowerCase().replace(/-(.)/g, function (m, g) {
        return g.toUpperCase();
    }).replace(/;\s?$/g, "").split(/:|;/g);
    for (var i = 0, n = s.length; i < n; i += 2)
        obj[s[i].replace(/\s/g, "")] = s[i + 1].replace(/^\s+|\s+$/g, "");
    return obj;
}

export function style2css(prop: any) {
    return prop.replace(/([a-z])([A-Z])/g, '$1-$2').toLocaleLowerCase();
}

const typeArray = ['symbol', 'bigint', 'undefined', 'boolean', 'string', 'number'];

export function isStaticType(val: any) {
    if (val === null || val === undefined)
        return true;
    const type = typeof val;
    if (typeArray.indexOf(type) >= 0)
        return true;
    return false;
}

export function log(...args: any): void {
    //const functionName = log.caller?.name || arguments.callee.caller?.name;
    console.log('%c----------', 'font-weight:bold');
    console.log(...args);
    console.log('%c----------', 'font-weight:bold');
}

export function STACK(...args: any) {
    //const functionName = log.caller?.name || arguments.callee.caller?.name;
    args.push((new Error(args.shift())).stack);
    log(...args);
}
