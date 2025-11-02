import { AttrType, BindTypes, IBindObject, IGtplObject } from './GEnums';
import { globalObject } from './global';

const Directives = new Map();

function registerDirective(name: string, cls: any) {
    if (Directives.has(name))
        return false;
    Directives.set(name, cls);
    return true;
}

const ElementDirectives = new WeakMap();

function applyDirective(ele: HTMLElement, name: string, value: string, objRoot: any) {
    const DirectiveClass = Directives.get(name);
    if (!DirectiveClass)
        return false;
    const instance = new DirectiveClass(ele, value, objRoot);
    let instances = ElementDirectives.get(ele);
    if (!instances) {
        instances = [];
        ElementDirectives.set(ele, instances);
    }
    instances.push(instance);
}

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
                tempvar = globalObject.document.createTextNode('');
            if (typeof attributes == 'string')
                tempvar.textContent = attributes;
        case '#comment':
            if (tempvar == null)
                tempvar = globalObject.document.createComment('');
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
            const ele = globalObject.document.createElement(nodeName);
            appendChildsFromFnc(ele, fncChilds, objRoot);
            if (Array.isArray(attributes)) {
                attributes.forEach((attr) => {
                    if (Array.isArray(attr)) {
                        if (!(Directives.has(attr[0]) && applyDirective(ele, attr[0], attr[1], objRoot))) {
                            ele.setAttribute(attr[0], attr[1]);
                        }
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

export const GregisterDirective = registerDirective;