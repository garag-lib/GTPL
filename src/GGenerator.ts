import { BindTypes, TypeEventProxyHandler } from './GEnums';
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
    getGtplRoot: Function,
    destroy: Function,
    eventPRoxy: Function,
    addTo: Function,
    launchChange: Function
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

//---

export type AttrType = (string | IBindObject | string[]);

export type ProGen = string | Function;

export type TplVar = string[];

//---

function bindNode(bind: IBindObject, node?: Node, mark?: Node) {
    if (mark)
        bind.mark = mark;
    if (node)
        bind.ele = node;
    return bind;
}

function appendChildsFromFnc(ele: Node | any[], childs: Node | Function | any[], objRoot: IGtplObject) {
    //console.log('appendChildsFromFnc', ele, childs, objRoot);
    if (Array.isArray(childs)) {
        childs.forEach((child: any) => {
            appendChildsFromFnc(ele, child, objRoot);
        });
    } else if (typeof childs == 'function') {
        appendChildsFromFnc(ele, childs(objRoot), objRoot);
    } else if (childs !== null && childs !== undefined) {
        if (Array.isArray(ele)) {
            ele.push(childs);
        } else {
            ele.appendChild(childs);
            /*
            try {
                if (ele.nodeName && ele.nodeName.toLowerCase() == 'select' &&
                    childs.nodeName && childs.nodeName.toLowerCase() == 'option') {
                    if ((ele as HTMLSelectElement).value !== '' &&
                        (ele as HTMLSelectElement).value === (childs as HTMLOptionElement).value) {
                        (childs as HTMLOptionElement).selected = true;
                    }
                }
            } catch (ex) { console.error(ex); }
            */
        }
    }
}

function createElement(nodeName: string, attributes: AttrType[], fncChilds: Function, objRoot: IGtplObject) {
    //console.log('createElement', nodeName, attributes, fncChilds, objRoot);
    let tempvar: any = null;
    switch (nodeName) {
        case '#text':
            if (tempvar == null)
                tempvar = document.createTextNode('');
            if (typeof attributes == 'string')
                tempvar.textContent = attributes;
        case '#comment':
            if (tempvar == null)
                tempvar = document.createComment('');
            if (typeof attributes == 'string') {
                tempvar.textContent = attributes;
            } else {
                attributes.forEach((attr) => {
                    if (typeof attr == 'string') {
                        tempvar.textContent = attr;
                        return;
                    }
                    if (Array.isArray(attr)) {
                        console.error(tempvar, attr);
                        return;
                    }
                    if (attr.type == BindTypes.TEXT)
                        objRoot.addBind(bindNode(<IBindObject>attr, tempvar));
                    else objRoot.addBind(bindNode(<IBindObject>attr, undefined, tempvar));
                });
            }
            return tempvar;
        default:
            const ele = document.createElement(nodeName);
            appendChildsFromFnc(ele, fncChilds, objRoot);
            if (Array.isArray(attributes)) {
                attributes.forEach((attr) => {
                    if (Array.isArray(attr)) {
                        ele.setAttribute(attr[0], attr[1]);
                    } else {
                        const bind: IBindObject = <IBindObject>attr;
                        objRoot.addBind(bindNode(bind, ele));
                    }
                });
            }
            return ele;
    }
}

function compile(gcode: string, ggenerator?: any): any {
    return new Function('g', `return ${gcode};`)(ggenerator ? ggenerator : createElement);
}

export const GGenerator = createElement;

export const GAddToo = appendChildsFromFnc;

export const GCompile = compile;