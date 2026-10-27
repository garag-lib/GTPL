import { NodeTypes, BindTypes, IBindObject, IFormula, IObjParsed, AttrType, ProGen } from '../GEnums';
import { GParse } from './GParse';
import { css2obj, log, style2css } from '../GUtils';
import { globalObject } from '../global';

let gparse!: GParse;

export interface GCodeOptions {
    allowFormulas?: boolean;
    allowEvents?: boolean;
    allowInnerHTML?: boolean;
}

export interface GCodeOptimizedOptions extends GCodeOptions {
    /** Short property-key aliases reduce source size but can slow initial rendering. */
    methodAliases?: boolean;
}

const defaultGCodeOptions: Required<GCodeOptions> = {
    allowFormulas: true,
    allowEvents: true,
    allowInnerHTML: true
};

function getGen(tag: string, attrs?: string | null, children?: string | null): string {
    return `g('${tag}',${attrs ?? 'null'},${children ?? 'null'},o)`;
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

function containsFormula(parsed: IObjParsed | undefined): boolean {
    return !!(parsed && parsed.formula);
}

function parseAttribute(
    atributos: AttrType[],
    prop: string,
    value: string,
    options: Required<GCodeOptions>
): boolean {
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
            if (prop === 'g-inner' && !options.allowInnerHTML)
                throw new Error('Unsafe directive blocked in safe mode: g-inner');
            tt = tt || BindTypes.INNER;
            gparse.setString(`{{${value}}}`);
            if (gparse.check()) {
                const single = gparse.getSingleResult();
                if (containsFormula(single) && !options.allowFormulas)
                    throw new Error('Unsafe formula blocked in safe mode');
                const attrObj = {
                    type: tt,
                    link: single
                };
                if (tt === BindTypes.IS) {
                    atributos.unshift(attrObj);
                } else {
                    atributos.push(attrObj);
                }
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
                        if (containsFormula(r[0] as IObjParsed) && !options.allowFormulas)
                            throw new Error('Unsafe formula blocked in safe mode');
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
                            if (containsFormula(r) && !options.allowFormulas)
                                throw new Error('Unsafe formula blocked in safe mode');
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
                    const isEvent = prop.startsWith('on');
                    if (isEvent && !options.allowEvents)
                        throw new Error(`Unsafe event blocked in safe mode: ${prop}`);
                    if (containsFormula(r[0] as IObjParsed) && !options.allowFormulas)
                        throw new Error('Unsafe formula blocked in safe mode');
                    const attrObj = {
                        type: isEvent ? BindTypes.EVENT : BindTypes.ATTR,
                        prop: isEvent ? prop.substring(2) : prop,
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
                                    const isAsync = /\bawait\b/.test(code) ? ' async ' : '';
                                    //const isAsync = code.match(/[\s;]await[\W]/gm) ? ' async ' : '';
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

interface IStringBuilder {
    add: (s: string) => void;
    addComma: (s: string, s_conds?: string[]) => void;
    addCommaOnly: (s_conds?: string[]) => void;
    toString: (s_left?: string, s_right?: string) => string;
}

function sb(): IStringBuilder {
    const parts: string[] = [];
    return {
        add(s: string): void {
            parts.push(s);
        },
        addComma(s: string, s_conds?: string[]): void {
            if (parts.length) {
                let needComma = true;
                const last = parts[parts.length - 1];
                if (s_conds?.includes(last)) needComma = false;
                if (needComma) parts.push(',');
            }
            parts.push(s);
        },
        addCommaOnly(s_conds?: string[]): void {
            if (parts.length) {
                let needComma = true;
                const last = parts[parts.length - 1];
                if (s_conds?.includes(last)) needComma = false;
                if (needComma) parts.push(',');
            }
        },
        toString(s_left: string = '', s_right: string = ''): string {
            return s_left + parts.join('') + s_right;
        }
    };
}

// One statement block per render function. Ordinary descendants are concatenated
// into their enclosing block; only structural bindings retain lazy generators.
interface ImperativeNode {
    name: string;
    statements: string[];
    eager: boolean;
}

interface ImperativeBlock {
    statements: string[];
    nodes: ImperativeNode[];
    nextId: () => string;
    depth: number;
    methods: Map<string, string> | null;
}

function imperativeBlock(nextId?: () => string, depth: number = 0, methods: Map<string, string> | null = null): ImperativeBlock {
    let index = 0;
    return { statements: [], nodes: [], nextId: nextId ?? (() => `$${depth}_${(index++).toString(36)}`), depth, methods };
}

const imperativeMethodAliases: Record<string, string> = {
    createElement: '$e',
    createTextNode: '$t',
    createComment: '$c',
    appendChild: '$a',
    addAttributes: '$s',
    addBind: '$b'
};

function imperativeMethod(block: ImperativeBlock, method: string): string {
    if (!block.methods) return `.${method}`;
    const alias = imperativeMethodAliases[method];
    block.methods.set(method, alias);
    // Alias the property key, keeping each call's receiver and dynamic lookup.
    return `[${alias}]`;
}

function imperativeFunction(block: ImperativeBlock, array: boolean = true): string {
    const result = array ? `[${block.nodes.map(node => node.name).join(',')}]` : block.nodes[0].name;
    const statements = block.statements.slice();
    for (const node of block.nodes)
        for (const statement of node.statements) statements.push(statement);
    return `(o)=>{${statements.join('')}return ${result};}`;
}

function imperativeElement(block: ImperativeBlock, tag: string, attrs: string, children: ImperativeBlock, eager: boolean = false): string {
    const name = eager ? block.nextId() : children.nextId();
    const statements: string[] = [];
    // Legacy array evaluation creates text and static leaves before entering g().
    // Inline the same schedule, including mixed eager/deferred siblings, without
    // allocating the legacy child functions or their nested arrays at runtime.
    for (const child of children.nodes)
        if (child.eager) statements.push(...child.statements);
    statements.push(`const ${name}=d${imperativeMethod(block, 'createElement')}(${JSON.stringify(tag)});`);
    for (const child of children.nodes) {
        if (!child.eager) {
            // Blocks reuse local names across siblings without closures. The
            // depth prefix keeps the parent's reference visible inside a child.
            statements.push('{', ...child.statements, `${name}${imperativeMethod(block, 'appendChild')}(${child.name});`, '}');
        } else {
            statements.push(`${name}${imperativeMethod(block, 'appendChild')}(${child.name});`);
        }
    }
    // Directives can be registered after compilation. Keep their runtime lookup,
    // and preserve child bindings/directives before the parent's attributes.
    if (attrs !== '[]')
        statements.push(`g${imperativeMethod(block, 'addAttributes')}(${attrs},${name},o);`);
    block.nodes.push({ name, statements, eager });
    return name;
}

function NodeList2Function(
    nodes: NodeListOf<ChildNode> | Node[],
    parent?: any,
    headers?: boolean,
    bindSwitch?: null | IBindObject,
    options: Required<GCodeOptions> = defaultGCodeOptions,
    imperative?: ImperativeBlock
): string {
    //---
    if (gparse == null)
        gparse = new GParse();
    //---
    let parse: IStringBuilder = sb();
    const emitNode = (tag: string, attrs: string) => {
        if (!imperative) {
            parse.addComma(getGen(tag, attrs), ['[']);
            return;
        }
        const name = imperative.nextId();
        const text = tag === '#text';
        const literal = !attrs.startsWith('[');
        const statements = [`const ${name}=d${imperativeMethod(imperative, text ? 'createTextNode' : 'createComment')}(${literal ? attrs : '""'});`];
        if (!literal) {
            // The compiler emits a single TEXT binding for an interpolated node.
            const bind = attrs.slice(1, -2);
            statements.push(`o${imperativeMethod(imperative, 'addBind')}(${bind},${text ? 'ele' : 'mark'}:${name}});`);
        }
        imperative.nodes.push({ name, statements, eager: true });
    };
    const emitMarker = (code: string) => {
        if (!imperative) {
            parse.add(code);
            return;
        }
        const name = imperative.nextId();
        imperative.nodes.push({ name, statements: [`const ${name}=${code};`], eager: !parent });
    };
    //if (headers !== false)
    //    parse = '[';
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
                        //if (parse != '[')
                        //    parse += ',';
                        //parse += getGen(node.nodeName, JSON.stringify(node.textContent));
                        if (imperative) {
                            imperativeElement(imperative, node.nodeName, '[]', imperativeBlock(imperative.nextId), true);
                        } else {
                            parse.addComma(getGen(node.nodeName, JSON.stringify(node.textContent)), ['[']);
                        }
                        continue;
                    }
                    //---
                    ele = <HTMLElement>node;
                    atributos = [];
                    for (let i = 0, n = ele.attributes.length, ref: NamedNodeMap = ele.attributes; i < n; i++) {
                        const attr = ref.item(i);
                        if (attr) {
                            if (!parseAttribute(atributos, attr.name, attr.value, options)) {
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
                    //if (parse != '[' && parse != '')
                    //    parse += ',';
                    parse.addCommaOnly(['[']);
                    //---
                    // A conditional template must return nodes when invoked. Passing null
                    // makes its immediate children execute inside its lazy generator.
                    const conditionalTemplate = ele.nodeName.toLowerCase() == 'template' &&
                        (bind_is || bind_if || bind_case || bind_for || bind_switch);
                    const structural = bind_is || bind_if || bind_case || bind_for || bind_switch;
                    const staticLeaf = !bind_tpl && atributos.every(attr => Array.isArray(attr)) &&
                        Array.from(ele.childNodes).every(child => child.nodeType === NodeTypes.TEXT_NODE &&
                            !(child.nodeValue || '').includes('{{'));
                    const eager = !parent || staticLeaf;
                    const fragment = bind_tpl && ele.nodeName.toLowerCase() === 'template' && !conditionalTemplate;
                    const childBlock = imperative
                        ? structural ? imperativeBlock(undefined, 0, imperative.methods)
                            // Included fragments are flattened into this scope. Their
                            // eager nodes must reserve names from the same allocator.
                            : eager || fragment ? imperativeBlock(imperative.nextId, imperative.depth, imperative.methods)
                                : imperativeBlock(undefined, imperative.depth + 1, imperative.methods)
                        : undefined;
                    if (bind_tpl) {
                        const ct: any = (<any>bind_tpl).link.vorc.ct;
                        const tpl = globalObject.document.getElementById(ct);
                        if (tpl) {
                            real = (ele.nodeName.toLowerCase() == 'template') ? parent : ele;
                            childs = (tpl.nodeName.toLowerCase() == 'template') ? (<any>tpl).content.childNodes : [tpl];
                            childsnodes = NodeList2Function(childs, conditionalTemplate || (fragment && real === undefined) ? null : real, !fragment, bind_switch, options, childBlock);
                        } else {
                            console.error('template ' + ct + ' undefined.');
                        }
                    } else {
                        real = (ele.nodeName.toLowerCase() == 'template') ? (<any>ele).content : ele;
                        childs = (<any>real).childNodes;
                        childsnodes = NodeList2Function(childs, conditionalTemplate ? null : real, true, bind_switch, options, childBlock);
                    }
                    //---
                    if (bind_is || bind_if || bind_case || bind_for || bind_switch) {

                        uuid = getId();

                        jsonAttr = '';
                        jsonAttr2 = '';

                        const common: any = [];

                        attrs = Attributes2JSON(atributos);

                        if (bind_is) {
                            (bind_is.attrs as any) = atributos;
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

                        let lazyGenerator: string | undefined;
                        if (imperative && childBlock) {
                            if (ele.nodeName.toLowerCase() === 'template') {
                                lazyGenerator = imperativeFunction(childBlock);
                            } else {
                                const body = imperativeBlock(childBlock.nextId, childBlock.depth, imperative.methods);
                                imperativeElement(body, ele.nodeName, attrs, childBlock);
                                lazyGenerator = imperativeFunction(body, false);
                            }
                        }

                        if (bind_tpl) {

                            if (ele.nodeName.toLowerCase() == 'template') {

                                common.push({
                                    'var': uuid,
                                    'gen': lazyGenerator ?? getFunction(childsnodes, true)
                                });

                            } else {

                                common.push({
                                    'var': uuid,
                                    'gen': lazyGenerator ?? getFunction(getGen(ele.nodeName, attrs, childsnodes), true)
                                });

                            }

                        } else {

                            common.push({
                                'var': uuid,
                                'gen': bind_is ? 'null' : lazyGenerator ?? (ele.nodeName.toLowerCase() == 'template' ? getFunction(childsnodes, true) : getFunction(getGen(ele.nodeName, attrs, childsnodes), true))
                            });

                        }

                        if (bind_case) {

                            bind_case.uid = uuid;
                            bind_case.gen = uuid;
                            bind_case.common = common;

                            emitMarker(getFunction(getGen('#comment', '[' + JSON.stringify(uuid) + ',' + jsonAttr + ']'), imperative ? null : parent));

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

                                emitMarker(getFunction(getGen('#comment', '[' + JSON.stringify(bind_for.uid) + ',' + jsonAttr + ']'), imperative ? null : parent, common));

                            } else {

                                // jsonAttr -> solo if, notif, switch, is ...

                                emitMarker(getFunction(getGen('#comment', '[' + JSON.stringify(uuid) + ',' + jsonAttr + ']'), imperative ? null : parent, common));

                            }

                        }

                    } else {
                        if (imperative && childBlock) {
                            if (bind_tpl && ele.nodeName.toLowerCase() === 'template') {
                                imperative.statements.push(...childBlock.statements);
                                imperative.nodes.push(...childBlock.nodes);
                            } else {
                                imperativeElement(imperative, ele.nodeName, Attributes2JSON(atributos), childBlock, eager);
                            }
                        } else if (bind_tpl && ele.nodeName.toLowerCase() == 'template') {
                            parse.add(childsnodes);
                        } else {
                            const gen = getGen(ele.nodeName, Attributes2JSON(atributos), childsnodes);
                            // A static leaf needs no child closure. Its enclosing structural
                            // generator still controls when its DOM and directives are created.
                            parse.add(staticLeaf ? gen : getFunction(gen, parent));
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
                                    //if (parse != '[' && parse != '')
                                    //    parse += ',';
                                    if (typeof item == 'string') {
                                        emitNode(node.nodeName, JSON.stringify(item));
                                    } else {
                                        if (containsFormula(item as IObjParsed) && !options.allowFormulas)
                                            throw new Error('Unsafe formula blocked in safe mode');
                                        emitNode(node.nodeName, Attributes2JSON([{
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
                        //if (parse != '[' && parse != '')
                        //    parse += ',';
                        emitNode(node.nodeName, JSON.stringify(node.nodeValue));
                    }
                }
                break;
            case NodeTypes.COMMENT_NODE:
                {
                    //if (parse != '[' && parse != '')
                    //    parse += ',';
                    emitNode(node.nodeName, JSON.stringify(node.nodeValue));
                }
                break;
        }
    };
    //if (headers !== false)
    //   parse += ']';
    // The imperative caller owns the statement block. Serialize only at render
    // boundaries, avoiding repeated source generation for ordinary descendants.
    if (imperative) return '';
    const result = parse.toString(headers !== false ? '[' : '', headers !== false ? ']' : '');
    if (parent === undefined)
        return '(o)=>' + result;
    return result;
}

function parseTemplateNodes(html: string): NodeListOf<ChildNode> {
    // Without an explicit body, DOMParser puts leading <template> roots in
    // document.head. Parse all supplied template markup in the same body context.
    return new DOMParser().parseFromString('<body>' + html.trim(), 'text/html').body.childNodes;
}

export function GCode(html: string | Node | NodeListOf<ChildNode>): string {
    const options = { ...defaultGCodeOptions };
    if (typeof html == 'string') {
        return NodeList2Function(parseTemplateNodes(html), undefined, undefined, undefined, options);
    } else {
        return NodeList2Function(html instanceof Node ? [html] : html, undefined, undefined, undefined, options);
    }
}

export function GCodeSafe(html: string | Node | NodeListOf<ChildNode>, options?: GCodeOptions): string {
    const safeOptions: Required<GCodeOptions> = {
        allowFormulas: false,
        allowEvents: false,
        allowInnerHTML: false,
        ...options
    };
    if (typeof html == 'string') {
        return NodeList2Function(parseTemplateNodes(html), undefined, undefined, undefined, safeOptions);
    } else {
        return NodeList2Function(html instanceof Node ? [html] : html, undefined, undefined, undefined, safeOptions);
    }
}

/** Opt-in imperative backend. Requires the current GGenerator runtime helpers. */
export function GCodeOptimized(html: string | Node | NodeListOf<ChildNode>, options?: GCodeOptimizedOptions): string {
    const block = imperativeBlock(undefined, 0, options?.methodAliases ? new Map() : null);
    block.statements.push('const d=g.getDocument();');
    const settings = { ...defaultGCodeOptions, ...options };
    if (typeof html === 'string') {
        NodeList2Function(parseTemplateNodes(html), undefined, undefined, undefined, settings, block);
    } else {
        NodeList2Function(html instanceof Node ? [html] : html, undefined, undefined, undefined, settings, block);
    }
    if (block.methods?.size) {
        const aliases = Array.from(block.methods, ([method, alias]) => `${alias}=${JSON.stringify(method)}`);
        block.statements.push(`const ${aliases.join(',')};`);
    }
    return imperativeFunction(block);
}

/** Safe parsing restrictions with the imperative backend. */
export function GCodeOptimizedSafe(html: string | Node | NodeListOf<ChildNode>, options?: GCodeOptimizedOptions): string {
    return GCodeOptimized(html, { allowFormulas: false, allowEvents: false, allowInnerHTML: false, ...options });
}
