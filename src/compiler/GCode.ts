import { NodeTypes, BindTypes, IBindObject, IFormula, IObjParsed, AttrType, ProGen } from '../GEnums';
import { GParse } from './GParse';
import { css2obj, log, style2css } from '../GUtils';
import { globalObject } from '../global';

let gparse!: GParse;

const regex_var = /([a-zA-Z\_][\w]+)\s*\=\s*([a-zA-Z][\w\.]+)/gi;

function getGen(nodeName: string, atributos: string | null, nodelist?: string | null): string {
    return 'g(\'' + nodeName + '\',' + (atributos ? atributos : 'null') + ',' + (nodelist ? nodelist : 'null') + ',o)';
}

function getFunction(gen: string, parent?: any, commongen?: any): string {
    if (commongen) {
        let str: string[] = [];
        commongen.forEach((com: any) => {
            str.push('const ' + com.var + '=' + com.gen + ';');
        });
        return '((o)=>{' + str.join('') + 'return ' + gen + '})' + (!parent ? '(o)' : '');
    }
    return '((o)=>' + gen + ')' + (!parent ? '(o)' : '');
}

function addGen2Obj(bind: IBindObject, uuid: null | string, gen?: ProGen, plus?: string) {
    let jsonBind: string = Attributes2JSON([bind], true);
    jsonBind = jsonBind.substring(0, jsonBind.length - 1);
    jsonBind = jsonBind + ',"gen":' + (gen ? gen : uuid) + (plus ? plus : '') + '}';
    return jsonBind;
}

function addGen2ObjConditional(bind: IBindObject, uuid: string, bind_for: IBindObject | null, jsonAttr2: string, jsonAttr: string, plus?: string) {
    bind.uid = uuid;
    if (bind_for) {
        if (jsonAttr2 != '')
            jsonAttr2 += ',';
        jsonAttr2 += addGen2Obj(bind, uuid, undefined, plus);
    } else {
        if (jsonAttr != '')
            jsonAttr += ',';
        jsonAttr += addGen2Obj(bind, uuid, undefined, plus);
    }
    return { jsonAttr2, jsonAttr };
}

function parseAttribute(atributos: AttrType[], prop: string, value: string): boolean {
    let tt: null | BindTypes = null;
    switch (prop) {
        case 'g-is':
            tt = tt || BindTypes.IS;
        case 'g-binds':
            tt = tt || BindTypes.ELES;
        case 'g-bind':
            tt = tt || BindTypes.ELE;
        case 'g-attr':
            tt = tt || BindTypes.ATTR;
        case 'g-if':
            tt = tt || BindTypes.IF;
        case 'g-notif':
            tt = tt || BindTypes.NOTIF;
        case 'g-switch':
            tt = tt || BindTypes.SWITCH;
        case 'g-case':
            tt = tt || BindTypes.CASE;
        case 'g-for':
            tt = tt || BindTypes.FOR;
        case 'g-inner':
            tt = tt || BindTypes.INNER;
            gparse.setString(`{{${value}}}`);
            if (gparse.check()) {
                const attrObj = {
                    type: tt,
                    link: gparse.getSingleResult()
                };
                if (tt === BindTypes.IS) {
                    atributos.unshift(attrObj);
                } else {
                    atributos.push(attrObj);
                }
                return true;
            }
            break;
        case 'g-var':
            tt = tt || BindTypes.VAR;
            if (value.match(regex_var)) {
                const vars = value.split(regex_var);
                atributos.push({
                    type: tt,
                    link: {
                        svar: vars[1],
                        vorc: {
                            va: vars[2].split('.')
                        }
                    }
                });
                return true;
            }
            break;
        case 'g-tpl':
            tt = tt || BindTypes.TPL;
            atributos.push({
                type: tt,
                link: {
                    vorc: {
                        ct: value
                    }
                }
            });
            return true;
        case 'g-style':
            if (!value.includes('{{'))
                value = `{{${value}}}`;
        case 'style':
            let csstext: string = '';
            gparse.setString(value);
            if (gparse.check()) {
                let r: any = gparse.getResult();
                if (r && r.length) {
                    if (r.length == 1) {
                        atributos.push({
                            type: BindTypes.STYLE,
                            prop: 'cssText',
                            link: <any>r[0]
                        });
                        return true;
                    }
                    const cssobj = css2obj(value);
                    for (const [key, val] of Object.entries(cssobj)) {
                        gparse.setString(<string>val);
                        if (gparse.check()) {
                            r = gparse.getSingleResult();
                            atributos.push({
                                type: BindTypes.STYLE,
                                prop: key,
                                link: r
                            });
                        } else {
                            csstext += csstext ? ';' : '';
                            csstext += `${style2css(key)}:${val}`;
                        }
                    }
                    if (csstext != '')
                        atributos.push(['style', csstext]);
                    return true;
                }
            }
            break;
        default:
            gparse.setString(value);
            if (gparse.check()) {
                const r = gparse.getResult();
                if (r && r.length == 1) {
                    const attrObj = {
                        type: prop.startsWith('on') ? BindTypes.EVENT : BindTypes.ATTR,
                        prop: prop.startsWith('on') ? prop.substring(2) : prop,
                        link: <any>r[0]
                    };
                    atributos.push(attrObj);
                    return true;
                }
            }
            break;
    }
    return false;
}

function Attributes2JSON(atributos: AttrType[], onlyone: boolean = false): string {
    const json = atributos.map(attr => {
        if (Array.isArray(attr) || typeof attr === 'string') {
            return JSON.stringify(attr);
        } else {
            const bind = attr as IBindObject;
            if (bind.link?.formula) {
                const obj = Object.entries(bind).map(([key, value]) => {
                    if (key === 'link') {
                        const linkObj = Object.entries(value).map(([subKey, subValue]) => {
                            if (subKey === 'formula') {
                                const { vars, code } = subValue as IFormula;
                                if (code != undefined) {
                                    const fncParams = vars?.map(v => v[0]).join(',') || '';
                                    const isAsync = code.match(/[\s;]await[\W]/gm) ? ' async ' : '';
                                    const fncBody = `{${code}}`;
                                    return `"${subKey}":{"vars":${JSON.stringify(vars)},"fnc":${isAsync}function(${fncParams})${fncBody}}`;
                                } else {
                                    log('formula without code');
                                }
                            }
                            return `"${subKey}":${JSON.stringify(subValue)}`;
                        }).join(',');
                        return `"${key}":{${linkObj}}`;
                    }
                    return `"${key}":${JSON.stringify(value)}`;
                }).join(',');
                return `{${obj}}`;
            } else {
                return JSON.stringify(attr);
            }
        }
    });
    return onlyone ? json.join(',') : `[${json.join(',')}]`;
}

let letterIndex = 0;
let counter = 0;
const maxCounter = 36 ** 5;
function getId(): string {
    if (counter >= maxCounter) {
        counter = 0;
        letterIndex++;
        if (letterIndex >= 26)
            letterIndex = 0;
    }
    const letra = String.fromCharCode(97 + letterIndex); 
    const sufijo = counter.toString(36).padStart(5, '0');
    counter++;
    return letra + sufijo;
}

async function NodeList2Function(nodes: NodeListOf<ChildNode> | Node[], parent?: any, headers?: boolean, bindSwitch?: null | IBindObject): Promise<string> {
    //---
    if (gparse == null)
        gparse = new GParse();
    //---
    let parse: string = '';
    if (headers !== false)
        parse = '[';
    //---
    let bind_for: null | IBindObject,
        bind_switch: null | IBindObject,
        bind_case: null | IBindObject,
        bind_if: null | IBindObject,
        bind_is: null | IBindObject,
        bind_tpl: null | IBindObject;
    let ele: HTMLElement, real: undefined | HTMLElement | Node;
    let childs: NodeListOf<ChildNode>;
    let childsnodes: string,
        jsonAttr: string,
        jsonAttr2: string,
        jsonBind: string,
        attrs: string;
    let atributos: AttrType[];
    let uuid: string;
    //---
    for (var i = 0, fin = nodes.length; i < fin; i++) {
        var node = nodes[i];
        bind_for = bind_switch = bind_case = bind_if = bind_is = bind_tpl = null;
        childsnodes = jsonAttr = jsonAttr2 = jsonBind = attrs = '';
        switch (node.nodeType) {
            case NodeTypes.ELEMENT_NODE:
                {
                    //---
                    if (node.nodeName.toLowerCase() == 'script') {
                        if (parse != '[')
                            parse += ',';
                        parse += getGen(node.nodeName, JSON.stringify(node.textContent));
                        continue;
                    }
                    //---
                    ele = <HTMLElement>node;
                    atributos = [];
                    for (let i = 0, n = ele.attributes.length, ref: NamedNodeMap = ele.attributes; i < n; i++) {
                        const attr = ref.item(i);
                        if (attr) {
                            if (!parseAttribute(atributos, attr.name, attr.value)) {
                                atributos.push([attr.name, attr.value]);
                            } else if (atributos.length) {
                                const bind: any = atributos[atributos.length - 1];
                                if (bind) {
                                    if (bind.type == BindTypes.IS) {
                                        bind_is = <IBindObject>bind;
                                        atributos.pop();
                                    }
                                    if (bind.type == BindTypes.IF || bind.type == BindTypes.NOTIF) {
                                        bind_if = <IBindObject>bind;
                                        atributos.pop();
                                    }
                                    if (bind.type == BindTypes.FOR) {
                                        bind_for = <IBindObject>bind;
                                        atributos.pop();
                                    }
                                    if (bind.type == BindTypes.SWITCH) {
                                        bind_switch = <IBindObject>bind;
                                        atributos.pop();
                                    }
                                    if (bind.type == BindTypes.CASE) {
                                        if (!bindSwitch)
                                            throw new Error('not switch');
                                        if (!bindSwitch.case)
                                            bindSwitch.case = [];
                                        bindSwitch.case.push(bind);
                                        bind_case = <IBindObject>bind;
                                        bind_case.index = bindSwitch.case.length - 1;
                                        atributos.pop();
                                    }
                                    if (bind.type == BindTypes.TPL) {
                                        bind_tpl = <IBindObject>bind;
                                        atributos.pop();
                                    }
                                }
                            }
                        }
                    }
                    //---
                    if (bind_for && bind_case)
                        throw new Error('not for and case ' + Array.from(ele.attributes, (item) => item.name + '="' + item.value + '"').join(' '));
                    if (bind_if && bind_case)
                        throw new Error('not if and case ' + Array.from(ele.attributes, (item) => item.name + '="' + item.value + '"').join(' '));
                    if (bind_is && (bind_case || bind_switch || bind_tpl))
                        throw new Error('not is and ( case or switch ot tpl ) ' + Array.from(ele.attributes, (item) => item.name + '=' + item.value + '"').join(' '));
                    //---
                    if (parse != '[' && parse != '')
                        parse += ',';
                    //---
                    if (bind_tpl) {
                        const ct: any = (<any>bind_tpl).link.vorc.ct;
                        const tpl = globalObject.document.getElementById(ct);
                        if (tpl) {
                            real = (ele.nodeName.toLowerCase() == 'template') ? parent : ele;
                            childs = (tpl.nodeName.toLowerCase() == 'template') ? (<any>tpl).content.childNodes : [tpl];
                            childsnodes = await NodeList2Function(childs, real, true, bind_switch);
                        } else {
                            /** @TODO better fetch **/
                            const tpl = await (await fetch(ct)).text();
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(tpl.trim(), "text/html");
                            childsnodes = await NodeList2Function(doc.body.childNodes, real, true, bind_switch);
                        }
                    } else {
                        real = (ele.nodeName.toLowerCase() == 'template') ? (<any>ele).content : ele;
                        childs = (<any>real).childNodes;
                        childsnodes = await NodeList2Function(childs, real, true, bind_switch);
                    }
                    //---
                    if (bind_is || bind_if || bind_case || bind_for || bind_switch) {

                        uuid = getId();

                        jsonAttr = '';
                        jsonAttr2 = '';

                        const common: any = [];

                        attrs = Attributes2JSON(atributos);

                        if (bind_is) {
                            ({ jsonAttr2, jsonAttr } = addGen2ObjConditional(bind_is, uuid, bind_for, jsonAttr2, jsonAttr));
                        }

                        if (bind_if) {
                            ({ jsonAttr2, jsonAttr } = addGen2ObjConditional(bind_if, uuid, bind_for, jsonAttr2, jsonAttr));
                        }

                        if (bind_switch) {
                            bind_switch.uid = uuid;
                            const cases = bind_switch.case;
                            delete bind_switch.case;
                            //---
                            jsonBind = '';
                            if (cases) {
                                cases.forEach((ccase: IBindObject) => {
                                    if (ccase.common) {
                                        ccase.common.forEach((com: any) => common.push(com));
                                        delete ccase.common;
                                    }
                                    if (ccase.gen) {
                                        const gen = ccase.gen;
                                        delete ccase.gen;
                                        if (jsonBind != '')
                                            jsonBind += ',';
                                        jsonBind += addGen2Obj(ccase, null, gen);
                                    }
                                });
                            }
                            //---
                            ({ jsonAttr2, jsonAttr } = addGen2ObjConditional(bind_switch, uuid, bind_for, jsonAttr2, jsonAttr, ',"case":[' + jsonBind + ']'));
                            //---
                        }

                        if (bind_tpl) {

                            if (ele.nodeName.toLowerCase() == 'template') {

                                common.push({
                                    'var': uuid,
                                    'gen': childsnodes
                                });

                            } else {

                                common.push({
                                    'var': uuid,
                                    'gen': getFunction(getGen(ele.nodeName, attrs, childsnodes), true)
                                });

                            }

                        } else {

                            common.push({
                                'var': uuid,
                                'gen': bind_is ? 'null' : getFunction(getGen(ele.nodeName, attrs, childsnodes), true)
                            });

                        }

                        if (bind_case) {

                            bind_case.uid = uuid;
                            bind_case.gen = uuid;
                            bind_case.common = common;

                            parse += getFunction(getGen('#comment', '[' + JSON.stringify(uuid) + ',' + jsonAttr + ']'), parent);

                        } else {

                            if (bind_for) {

                                if (bind_if || bind_is || bind_switch) {

                                    bind_for.uid = getId();
                                    if (jsonAttr != '')
                                        jsonAttr += ',';
                                    jsonAttr += addGen2Obj(bind_for, bind_for.uid);

                                    // jsonAttr2 -> solo if, notif, switch, is ...

                                    common.push({
                                        'var': bind_for.uid,
                                        'gen': getFunction(getGen('#comment', '[' + JSON.stringify(uuid) + ',' + jsonAttr2 + ']'), true)
                                    });

                                } else {

                                    bind_for.uid = uuid;
                                    if (jsonAttr != '')
                                        jsonAttr += ',';
                                    jsonAttr += addGen2Obj(bind_for, uuid);

                                }

                                // jsonAttr -> solo for

                                parse += getFunction(getGen('#comment', '[' + JSON.stringify(bind_for.uid) + ',' + jsonAttr + ']'), parent, common);

                            } else {

                                // jsonAttr -> solo if, notif, switch, is ...

                                parse += getFunction(getGen('#comment', '[' + JSON.stringify(uuid) + ',' + jsonAttr + ']'), parent, common);

                            }

                        }

                    } else {

                        if (bind_tpl) {

                            if (ele.nodeName.toLowerCase() == 'template') {

                                parse += childsnodes;

                            } else {

                                parse += getFunction(getGen(ele.nodeName, Attributes2JSON(atributos), childsnodes), parent);

                            }

                        } else {

                            parse += getFunction(getGen(ele.nodeName, Attributes2JSON(atributos), childsnodes), parent);

                        }

                    }
                    //---
                }
                break;
            case NodeTypes.TEXT_NODE:
                {
                    let normal: boolean = true;
                    if (node.nodeValue) {
                        gparse.setString(node.nodeValue);
                        if (gparse.check()) {
                            normal = false;
                            const r = gparse.getResult();
                            if (r && r.length) {
                                r.forEach((item: string | IObjParsed) => {
                                    if (parse != '[' && parse != '')
                                        parse += ',';
                                    if (typeof item == 'string') {
                                        parse += getGen(node.nodeName, JSON.stringify(item));
                                    } else {
                                        parse += getGen(node.nodeName, Attributes2JSON([{
                                            type: BindTypes.TEXT,
                                            prop: 'textContent',
                                            link: item
                                        }]));
                                    }
                                });
                            }
                        }
                    }
                    if (normal) {
                        if (parse != '[' && parse != '')
                            parse += ',';
                        parse += getGen(node.nodeName, JSON.stringify(node.nodeValue));
                    }
                }
                break;
            case NodeTypes.COMMENT_NODE:
                {
                    if (parse != '[' && parse != '')
                        parse += ',';
                    parse += getGen(node.nodeName, JSON.stringify(node.nodeValue));
                }
                break;
        }
    };
    if (headers !== false)
        parse += ']';
    if (parent === undefined)
        return '(o)=>' + parse;
    return parse;
}

export async function GCode(html: string | Node | NodeListOf<ChildNode>): Promise<string> {
    if (typeof html == 'string') {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html.trim(), "text/html");
        return NodeList2Function(doc.body.childNodes);
    } else {
        return NodeList2Function(html instanceof Node ? [html] : html);
    }
}
