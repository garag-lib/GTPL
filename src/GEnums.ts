export const enum TypeEventProxyHandler {
    SET,       // 0
    UNSET,     // 1
    CALL,      // 2  ← para trap apply()
    DEFINE,    // 3  ← para trap defineProperty()
    UKNOW4,    // 4
    UKNOW5,    // 5
    UKNOW6,    // 6
    UKNOW7,    // 7
    UKNOW8     // 8
};

export const enum BindTypes {
    TEXT,
    IF,
    NOTIF,
    SWITCH,
    CASE,
    FOR,
    EVENT,
    ATTR,
    STYLE,
    INNER,
    ELE,
    ELES,
    IS,
    REF,
    TPL,
    VAR
};

export const enum NodeTypes {
    ELEMENT_NODE = 1,
    ATTRIBUTE_NODE,
    TEXT_NODE,
    CDATA_SECTION_NODE,
    //ENTITY_REFERENCE_NODE,
    //ENTITY_NODE,
    PROCESSING_INSTRUCTION_NODE,
    COMMENT_NODE,
    DOCUMENT_NODE,
    DOCUMENT_TYPE_NODE,
    DOCUMENT_FRAGMENT_NODE,
    //NOTATION_NODE
};

export type PathProxyHandler = any;

export type EventFunctionProxyHandler = (
    type: TypeEventProxyHandler,
    path: PathProxyHandler,
    value: any,
    objRef: any
) => void;

export type AttrType = (string | IBindObject | string[]);

export type ProGen = string | Function;

export type TplVar = string[];

export interface IBindDef {
    key: string;
    val: any;
    pro: any;
}
export interface IVarOrConst {
    va?: null | TplVar,
    ct?: null | string
}

export interface IFunction {
    name: TplVar,
    params?: IVarOrConst[]
}

export interface IIndex {
    index: string,
    target: string
}

export interface IFormula {
    code?: string,
    vars?: TplVar[],
    fnc?: Function
}

export interface IObjParsed {
    vorc?: IVarOrConst,
    svar?: string,
    functions?: IFunction[],
    index?: IIndex,
    formula?: IFormula,
    params?: IVarOrConst[]
}

export interface IGtplObject {
    refresh(): unknown;
    ID?: string,
    Root: any,
    Elements: any,
    RenderElements?: any,
    GtplChilds: Set<IGtplObject>,
    BindMap: Map<IBindObject, IGtplObject>,
    BindTree: any;
    BindDef: any,
    addBind: Function,
    getContext: Function,
    getValue: Function,
    getRoot: Function,
    localVars: Map<string, any>,
    getGtplRoot: Function,
    destroy: Function,
    eventPRoxy: Function,
    addTo: Function,
    launchChange: Function,
    BoundEventProxy: EventFunctionProxyHandler
    cleanupCallbacks?: Set<() => void>;
    isDestroyed?: boolean;
    onCleanup(callback: () => void): void;
}

export interface IBindObject {
    type: BindTypes,
    prop?: string,
    link: IObjParsed,
    index?: number,
    case?: IBindObject[],
    gen?: ProGen,
    uid?: string,
    common?: any,
    ele?: any,
    mark?: any,
    eles?: IGtplObject[],
    gtpl?: IGtplObject,
    simetric?: boolean,
    attrs?: string[]
}
