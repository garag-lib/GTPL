/*!
* @mpeliz/gtpl v3.0.0
* (c) 2024 Manuel Peliz
* @license Apache-2.0
* @repository [object Object]
*/
import { G as GTpl, I as IGtplObject, A as AttrType, a as GProxy, u as unGProxy, l as log, S as STACK, c as css2obj, s as style2css, i as isGProxy, t as toRaw } from './shared/GTpl.js';

declare function GCompile(gcode: string, generator?: any): any;

interface GCodeOptimizedOptions {
    /** Short property-key aliases reduce source size but can slow initial rendering. */
    methodAliases?: boolean;
}
declare function GCode(html: string | Node | NodeListOf<ChildNode>): string;
/** Opt-in imperative backend. Requires the current GGenerator runtime helpers. */
declare function GCodeOptimized(html: string | Node | NodeListOf<ChildNode>, options?: GCodeOptimizedOptions): string;

declare const _default: {
    jit: {
        GCompile: typeof GCompile;
        GCode: typeof GCode;
        GCodeOptimized: typeof GCodeOptimized;
    };
    GTpl: typeof GTpl;
    GAddTo: (ele: any[] | Node, childs: Function | any[] | Node, objRoot: IGtplObject) => void;
    GInsertAfterTo: (ele: any[] | Node, childs: Function | any[] | Node, objRoot: IGtplObject) => void;
    GInsertBeforeTo: (ele: any[] | Node, childs: Function | any[] | Node, objRoot: IGtplObject) => void;
    GregisterDirective: (name: string, cls: any) => boolean;
    GGenerator: ((nodeName: string, attributes: AttrType[], fncChilds: Function, objRoot: IGtplObject, namespaceURI?: string) => any) & {
        getDocument: () => Document;
        addAttributes: (attributes: AttrType[], ele: any, objRoot: IGtplObject) => void;
    };
    GProxy: typeof GProxy;
    unGProxy: typeof unGProxy;
    utils: {
        log: typeof log;
        stack: typeof STACK;
        css2obj: typeof css2obj;
        style2css: typeof style2css;
        globalObject: any;
        passiveSupported: any;
        isGProxy: typeof isGProxy;
        toRaw: typeof toRaw;
        PROXYTARGET: symbol;
        ISPROXY: symbol;
    };
};

export { _default as default };
