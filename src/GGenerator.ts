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

function applyDirective(ele: HTMLElement, name: string, value: string, objRoot: any, argument?: any) {
    const DirectiveClass = Directives.get(name);
    if (!DirectiveClass)
        return false;
    const instance = new DirectiveClass(ele, value, objRoot, argument);
    let instances = ElementDirectives.get(ele);
    if (!instances) {
        instances = [];
        ElementDirectives.set(ele, instances);
    }
    instances.push(instance);
    return instance;
}

//---

function bindNode(bind: IBindObject, node?: Node, mark?: Node) {
    if (mark)
        bind.mark = mark;
    if (node)
        bind.ele = node;
    return bind;
}

type NodeLike = Node | any[];
type ChildInput = Node | Function | any[];

function processChild(
    ele: NodeLike,
    childs: ChildInput,
    objRoot: IGtplObject,
    insertFn: (ele: Node, child: Node) => void
) {
    // Caso: array de hijos ⇒ procesar uno por uno
    if (Array.isArray(childs)) {
        childs.forEach(child => processChild(ele, child, objRoot, insertFn));
        return;
    }

    // Caso: función ⇒ ejecutar y procesar resultado
    if (typeof childs === "function") {
        processChild(ele, childs(objRoot), objRoot, insertFn);
        return;
    }

    // Valores vacíos ⇒ ignorar
    if (childs == null) {
        return;
    }

    // Si el elemento es un array ⇒ sólo pushear
    if (Array.isArray(ele)) {
        ele.push(childs);
        return;
    }

    // El resto: aplicar la función de inserción
    insertFn(ele, childs);
}

function appendChildsFromFnc(ele: NodeLike, childs: ChildInput, objRoot: IGtplObject) {
    processChild(ele, childs, objRoot, (e, c) => e.appendChild(c));
}

function insertBeforeFromFnc(ele: NodeLike, childs: ChildInput, objRoot: IGtplObject) {
    processChild(ele, childs, objRoot, (e, c) => {
        const parent = e.parentNode;
        if (parent) parent.insertBefore(c, e);
    });
}

function insertAfterFromFnc(ele: NodeLike, childs: ChildInput, objRoot: IGtplObject) {
    processChild(ele, childs, objRoot, (e, c) => {
        const parent = e.parentNode;
        if (!parent) return;
        const next = e.nextSibling;
        if (next) parent.insertBefore(c, next);
        else parent.appendChild(c);
    });
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
                    if (attr.type == BindTypes.TEXT) {
                        objRoot.addBind(bindNode(<IBindObject>attr, tempvar));
                    } else {
                        objRoot.addBind(bindNode(<IBindObject>attr, undefined, tempvar));
                    }
                });
            }
            return tempvar;
        default:
            const ele = globalObject.document.createElement(nodeName);
            appendChildsFromFnc(ele, fncChilds, objRoot);
            addArributes(attributes, ele, objRoot);
            return ele;
    }
}

function resolveDirective(attrName: string) {
    if (Directives.has(attrName))
        return { dirName: attrName, arg: null as string | null };
    const [dirName, arg] = attrName.split(':');
    if (Directives.has(dirName))
        return { dirName, arg };
    return null;
}

function addArributes(attributes: AttrType[], ele: any, objRoot: IGtplObject) {
    if (!Array.isArray(attributes)) return;
    const temp_directives: any[] = [];
    attributes.forEach((attr) => {
        if (Array.isArray(attr)) {
            // Atributo estático: ["g-set:nombre", "valor"]
            const res = resolveDirective(attr[0]);
            if (res) {
                temp_directives.push([attr, res]);
            } else {
                ele.setAttribute(attr[0], attr[1]);
            }
        } else {
            // Bind: IBindObject
            const bind: IBindObject = attr as IBindObject;
            let res: any = null;
            if (bind.prop) {
                res = resolveDirective(bind.prop as string);
                if (res) temp_directives.push([bind, res]);
            }
            if (!res) objRoot.addBind(bindNode(bind, ele));
        }
    });
    // Instanciar directivas
    temp_directives.forEach((entry) => {
        const bindOrAttr = entry[0];
        const res = entry[1];
        if (Array.isArray(bindOrAttr)) {
            // Atributo estático -> new Directive(ele, value, objRoot, arg)
            const [name, value] = bindOrAttr;
            applyDirective(ele, res.dirName, value, objRoot, res.arg);
        } else {
            // Bind -> instancia como "elemento" del bind
            const bind = bindOrAttr as IBindObject;
            const inst = applyDirective(ele, res.dirName, '', objRoot, res.arg);
            objRoot.addBind(bindNode(bind, inst));
        }
    });
}

function compile(gcode: string, ggenerator?: any): any {
    return new Function('g', `return ${gcode};`)(ggenerator ? ggenerator : createElement);
}

export const GGenerator = createElement;

export const GAddTo = appendChildsFromFnc;

export const GInsertBeforeTo = insertBeforeFromFnc;

export const GInsertAfterTo = insertAfterFromFnc;

export const GCompile = compile;

export const GregisterDirective = registerDirective;

export const GAddArributes = addArributes;