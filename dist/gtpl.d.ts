/*!
* @mpeliz/gtpl v1.1.2
* (c) 2024 Manuel Peliz
* @license Apache-2.0
* @repository [object Object]
*/
declare const enum TypeEventProxyHandler {
    SET = 0,
    UNSET = 1,
    CALL = 2,
    DEFINE = 3,
    UKNOW4 = 4,
    UKNOW5 = 5,
    UKNOW6 = 6,
    UKNOW7 = 7,
    UKNOW8 = 8
}
declare const enum BindTypes {
    TEXT = 0,
    IF = 1,
    NOTIF = 2,
    SWITCH = 3,
    CASE = 4,
    FOR = 5,
    EVENT = 6,
    ATTR = 7,
    STYLE = 8,
    INNER = 9,
    ELE = 10,
    ELES = 11,
    IS = 12,
    TPL = 13
}
type PathProxyHandler = any;
type EventFunctionProxyHandler = (type: TypeEventProxyHandler, path: PathProxyHandler, value: any, objRef: any) => void;
type AttrType = (string | IBindObject | string[]);
type ProGen = string | Function;
type TplVar = string[];
interface IBindDef {
    key: string;
    val: any;
    pro: any;
}
interface IVarOrConst {
    va?: null | TplVar;
    ct?: null | string;
}
interface IFunction {
    name: TplVar;
    params?: IVarOrConst[];
}
interface IIndex {
    index: string;
    target: string;
}
interface IFormula {
    code?: string;
    vars?: TplVar[];
    fnc?: Function;
}
interface IObjParsed {
    vorc?: IVarOrConst;
    svar?: string;
    functions?: IFunction[];
    index?: IIndex;
    formula?: IFormula;
    params?: IVarOrConst[];
}
interface IGtplObject {
    refresh(): unknown;
    ID?: string;
    Root: any;
    Elements: any;
    RenderElements?: any;
    GtplChilds: Set<IGtplObject>;
    BindMap: Map<IBindObject, IGtplObject>;
    BindTree: any;
    BindDef: any;
    addBind: Function;
    getContext: Function;
    getValue: Function;
    getRoot: Function;
    getGtplRoot: Function;
    destroy: Function;
    eventPRoxy: Function;
    addTo: Function;
    insertAfterTo: Function;
    insertBeforeTo: Function;
    launchChange: Function;
    BoundEventProxy: EventFunctionProxyHandler;
    cleanupCallbacks?: Set<() => void>;
    isDestroyed?: boolean;
    onCleanup(callback: () => void): void;
}
interface IBindObject {
    type: BindTypes;
    prop?: string;
    link: IObjParsed;
    index?: number;
    case?: IBindObject[];
    gen?: ProGen;
    uid?: string;
    common?: any;
    ele?: any;
    mark?: any;
    eles?: IGtplObject[];
    gtpl?: IGtplObject;
    simetric?: boolean;
    attrs?: string[];
}

declare class GTpl implements IGtplObject {
    ID: string;
    /**
     * Referencia a la función generadora.
     */
    FncElements: Function | Array<any>;
    /**
     * Array de array de elementos html que forman la plantilla
     */
    Elements: Node[];
    /**
     * Objeto indexado a los elementos dinamicos de ka plantillas, for, switch etc...
     */
    RenderElements: any;
    /**
     * Es el arbol de objetos bindados siguiendo la misma ramificación que en el arbol html.
     */
    BindTree: any;
    /**
     * Son los objetos bindados con constantes, no dinámicos.
     */
    BindConst: Set<IBindObject>;
    /**
     * Mapa de objetos bindados a plantillas diferentes a la original.
     * Por ejemplo: cuando se tiene una plantilla dentro de otra plantilla.
     */
    BindMap: Map<IBindObject, IGtplObject>;
    /**
     * Son las claves de primer nivel de objetos bindados a la plantilla.
     */
    BindDef: Set<IBindDef>;
    /**
     * Plantillas hijas.
     */
    GtplChilds: Set<IGtplObject>;
    /**
     * Plantilla padre.
     */
    Parent: IGtplObject;
    /**
     * Utilizado para localizar el contexto de la variable que se solicita.
     */
    Context: Set<String>;
    /**
     * Objeto referencia para aplicar a la plantilla.
     */
    Root: any;
    BoundEventProxy: EventFunctionProxyHandler;
    cleanupCallbacks: Set<() => void>;
    watchers: Map<string, Set<Function>>;
    isDestroyed: boolean;
    constructor(options?: any);
    loadOptions(options?: any): void;
    getValue(key: any): any;
    getGtplRoot(): GTpl;
    getRoot(): any;
    getContext(key: string): GTpl;
    addBind(bind: IBindObject): void;
    private checkDestroyed;
    destroy(elements?: boolean): void;
    onCleanup(callback: () => void): void;
    refresh(): void;
    private processRenderAndApply;
    addTo(ele: Node | any[]): void;
    insertAfterTo(ele: Node | any[]): void;
    insertBeforeTo(ele: Node | any[]): void;
    watch(path: string | string[], cb: (info: any) => void): () => void;
    private emitWatchers;
    eventPRoxy(type: TypeEventProxyHandler, path: PathProxyHandler, value: any, objRef: any): void;
    launchChange(type: TypeEventProxyHandler, bind: IBindObject, path?: string[], value?: any): Promise<void>;
}

declare function css2obj(css: string): Record<string, string>;
declare function style2css(prop: string): string;
declare function log(...args: any[]): void;
declare function STACK(message: string, ...rest: any[]): void;

declare function GCode(html: string | Node | NodeListOf<ChildNode>): string;

declare const ISPROXY: unique symbol;
declare const PROXYTARGET: unique symbol;
declare function isGProxy(obj: any): obj is {
    [ISPROXY]: true;
    [PROXYTARGET]: any;
};
declare function GProxy<T extends object>(target: T, event: EventFunctionProxyHandler, objRef: any, parentPath?: PathProxyHandler): T;
declare function unGProxy<T = any>(target: T, event: EventFunctionProxyHandler): T;
declare function toRaw<T = any>(obj: T): T;

declare const _default: {
    GTpl: typeof GTpl;
    GAddTo: (ele: any[] | Node, childs: Function | any[] | Node, objRoot: IGtplObject) => void;
    GInsertAfterTo: (ele: any[] | Node, childs: Function | any[] | Node, objRoot: IGtplObject) => void;
    GInsertBeforeTo: (ele: any[] | Node, childs: Function | any[] | Node, objRoot: IGtplObject) => void;
    GregisterDirective: (name: string, cls: any) => boolean;
    GGenerator: (nodeName: string, attributes: AttrType[], fncChilds: Function, objRoot: IGtplObject) => any;
    GProxy: typeof GProxy;
    unGProxy: typeof unGProxy;
    jit: {
        GCompile: (gcode: string, ggenerator?: any) => any;
        GCode: typeof GCode;
    };
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
