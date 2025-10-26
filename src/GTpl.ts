import { BindTypes, TypeEventProxyHandler } from "./GEnums";
import { IGtplObject, IBindObject, IIndex } from "./GGenerator";
import {
  GProxy,
  removeEventHandler,
  PathProxyHandler,
  PROXYTARGET,
  ISPROXY,
  EventFunctionProxyHandler,
} from "./GProxy";
import { TplVar, GAddToo, IFunction, IVarOrConst } from "./GGenerator";
import { globalObject, passiveSupported } from "./global";
import { STACK, isStaticType, log } from "./GUtils";

const ElementReferenceIndex = Symbol("ElementReferenceIndex");

export interface IBindDef {
  key: string;
  val: any;
  pro: any;
}

const globalCache: any = {
  binitChangeEvents: false,
};

//---
class privateProperties {
  private static globalVar = new WeakMap();

  static init(gtpl: IGtplObject) {
    if (!privateProperties.globalVar.has(gtpl)) {
      privateProperties.globalVar.set(gtpl, {
        GenerationFinish: false,
        MarkEle: new WeakMap(),
        memValues: new WeakMap(),
        renderElements: new Set(),
      });
    }
  }

  static getProperty(gtpl: IGtplObject, key: string) {
    privateProperties.init(gtpl);
    const obj = privateProperties.globalVar.get(gtpl);
    return obj[key];
  }

  static setProperty(gtpl: IGtplObject, key: string, value: any) {
    privateProperties.init(gtpl);
    const obj = privateProperties.globalVar.get(gtpl);
    obj[key] = value;
  }
}

//---

interface IsimetricAttrValue {
  va: Array<string>;
  ctx: IGtplObject;
}

type simetricAttrValueSet = Set<IsimetricAttrValue>;

const simetricAttr: WeakMap<Node, simetricAttrValueSet> = new WeakMap();

function initChangeEvents() {
  if (globalCache.binitChangeEvents) return;
  globalCache.binitChangeEvents = true;
  const lastProcessedValue = new WeakMap();
  const changeEvent = function (event: any) {
    const ele: any = event.target;
    if (
      event.type === "change" &&
      lastProcessedValue.has(ele) &&
      lastProcessedValue.get(ele) === ele.value
    ) {
      return;
    }
    if (simetricAttr.has(ele)) {
      const temp = simetricAttr.get(ele);
      if (temp) {
        for (let obj of temp) {
          updateVar(obj.va, obj.ctx, ele.value);
        }
        lastProcessedValue.set(ele, ele.value);
      }
    }
  };
  if (globalObject.addEventListener) {
    globalObject.addEventListener("input", changeEvent);
    globalObject.addEventListener("change", changeEvent);
  }
}

//---

function addCheckRenderElement(gtpl: IGtplObject, bind: IBindObject) {
  const re: Set<IBindObject> = privateProperties.getProperty(
    gtpl,
    "renderElements"
  );
  if (!re.has(bind)) {
    re.add(bind);
  }
}

function checkRenderElements(gtpl: IGtplObject, originalbind: IBindObject) {
  const re: Set<IBindObject> = privateProperties.getProperty(
    gtpl,
    "renderElements"
  );
  if (!re.has(originalbind)) {
    return;
  }
  const arr = Array.isArray(gtpl.Elements) ? gtpl.Elements : [gtpl.Elements];
  arr.forEach((ele: Node, index: number) => {
    const bind: IBindObject = gtpl.RenderElements[index];
    if (bind && re.has(bind)) {
      let allok = true;
      if (bind.ele) {
        const element = Array.isArray(bind.ele) ? bind.ele[0] : bind.ele;
        if (!bind.mark.parentNode && !element.parentNode) {
          allok = false;
        } else if (bind.mark.parentNode && !element.parentNode) {
          show(bind);
          if (bind.eles) {
            (<any>bind.eles)[0].refresh();
            if ((<any>bind.eles)[0].refCase)
              show((<any>bind.eles)[0].refCase);
          }
        }
      } else if (bind.eles) {
        if (bind.mark.parentNode) {
          let marca: Node | null = null;
          const render_arr: any = [];
          bind.eles.forEach((gtpl: IGtplObject) => {
            const temp: any = [];
            gtpl.refresh();
            gtpl.addTo(temp);
            temp.forEach((ele: Node) => {
              if (!ele.parentNode) {
                render_arr.push(ele);
              } else if (!marca) {
                marca = ele;
              }
            });
          });
          if (render_arr.length) {
            show(
              {
                type: bind.type,
                link: bind.link,
                ele: render_arr,
                mark: marca ? marca : bind.mark,
              },
              false
            );
          }
        } else {
          allok = false;
        }
      }
      if (allok) {
        re.delete(bind);
      }
    }
  });
}

//---

function updateVar(
  va: Array<string>,
  ctx: IGtplObject,
  value: any,
  force: boolean = false
) {
  //console.log('updateVar', va, value, force);
  if (va.length > 1) {
    const reduce: any = (obj: any, index: number, fin: number) => {
      if (index == fin) return obj[va[index]];
      return reduce(obj[va[index]], ++index, fin);
    };
    const ret = reduce(ctx.Root, 0, va.length - 2);
    const fin = va[va.length - 1];
    if (force || ret[fin] != value) {
      ret[fin] = value;
    }
  } else {
    const fin = va[0];
    if (force || ctx.Root[fin] != value) {
      ctx.Root[fin] = value;
    }
  }
}

function reduceVar(
  gtpl: IGtplObject,
  name: string[],
  val?: any,
  index?: number,
  limit?: number
): any {
  if (index == undefined) index = 0;
  if (limit !== undefined && index >= name.length - limit) return val;
  const result = val == undefined ? gtpl.getValue(name[index++]) : val[name[index++]];
  if (limit !== undefined && index >= name.length - limit) return result;
  if (index >= name.length) return result;
  return reduceVar(gtpl, name, result, index);
}

async function reduceFnc(
  gtpl: IGtplObject,
  functions: IFunction[],
  index?: number,
  initval?: any
): Promise<any> {
  if (index == undefined)
    index = 0;
  const func = functions[index];
  const ctx = gtpl.getContext(func.name[0]);
  const fnc: Function = reduceVar(ctx, func.name);
  if (fnc) {
    const arrval: any[] = [];
    if (func.params) {
      func.params.forEach((param: IVarOrConst) => {
        if (param.ct != undefined)
          arrval.push(param.ct);
        else if (param.va != undefined)
          arrval.push(reduceVar(gtpl, param.va));
      });
    }
    if (initval != undefined)
      arrval.push(initval);
    initval = await fnc.apply(ctx.Root, arrval);
  } else {
    STACK('fnc undefined', index, functions);
  }
  index++;
  if (index >= functions.length)
    return initval;
  return await reduceFnc(gtpl, functions, index, initval);
}

//---

async function calculateBind(me: IGtplObject, bind: IBindObject, value?: any, extraarguments?: any) {
  let result: any = undefined;
  const gtpl = bind.gtpl ? bind.gtpl : me;
  if (bind.link.formula && bind.link.formula.fnc) {
    const fnc: Function = bind.link.formula.fnc;
    const arrval: any[] = [];
    if (bind.link.formula.vars) {
      const vars: TplVar[] = bind.link.formula.vars;
      vars.forEach((key) => {
        arrval.push(gtpl.getValue(key[0]));
      });
    }
    if (extraarguments) {
      arrval.push(extraarguments);
    }
    result = await fnc.apply(gtpl.Root, arrval);
  } else {
    if (bind.link.vorc) {
      if (bind.link.vorc.va != undefined)
        result = value != undefined ? value : reduceVar(gtpl, bind.link.vorc.va);
      if (bind.link.vorc.ct != undefined) result = bind.link.vorc.ct;
    }
    if (bind.link.functions) {
      result = await reduceFnc(gtpl, bind.link.functions, 0, result);
    }
  }
  return result;
}

//---

function getContext(gtpl: IGtplObject, bind: IBindObject) {
  let ctx: IGtplObject = gtpl;
  if (bind.link.vorc && bind.link.vorc.va) {
    ctx = gtpl.getContext(bind.link.vorc.va[0]);
  } else if (bind.link.functions) {
    const fnc: IFunction = bind.link.functions[0];
    ctx = gtpl.getContext(fnc.name[0]);
  }
  return ctx;
}

//---

function createGetterAndSetter(
  gtpl: IGtplObject,
  va: TplVar,
  bind: IBindObject
) {
  const key = va[0];
  const ref = gtpl.BindTree[key];
  if (ref != undefined) {
    return;
  }
  const defaultvalue = gtpl.getValue(key);
  const objdef: IBindDef = {
    key: key,
    val: defaultvalue, // target
    pro: undefined, // proxy
  };
  gtpl.BindDef.add(objdef);
  try {
    if (!gtpl.Root.hasOwnProperty(key))
      gtpl.Root[key] = null;
    Object.defineProperty(gtpl.Root, key, {
      get: function () {
        if (objdef.pro !== undefined) return objdef.pro;
        if (isStaticType(objdef.val)) return objdef.val;
        while (objdef.val[ISPROXY]) objdef.val = objdef.val[PROXYTARGET];
        objdef.pro = GProxy(objdef.val, gtpl.BoundEventProxy, objdef, [
          objdef.key,
        ]);
        return objdef.pro;
      },
      set: function (newval: any) {
        objdef.val = newval;
        if (isStaticType(newval)) {
          delete objdef.pro;
          gtpl.eventPRoxy(
            TypeEventProxyHandler.SET,
            [objdef.key],
            newval,
            objdef
          );
          return objdef.val;
        } else {
          while (objdef.val[ISPROXY]) objdef.val = objdef.val[PROXYTARGET];
          objdef.pro = GProxy(
            objdef.val,
            gtpl.BoundEventProxy,
            objdef,
            [objdef.key]
          );
          gtpl.eventPRoxy(
            TypeEventProxyHandler.SET,
            [objdef.key],
            newval,
            objdef
          );
          return objdef.pro;
        }
      },
    });
  } catch (ex) {
    STACK((<any>ex).message, key, gtpl.Root);
  }
}

function addBind2Object(gtpl: IGtplObject, va: TplVar, bind: IBindObject) {
  let ref: any = gtpl.BindTree;
  for (let i = 0, n = va.length; i < n; i++) {
    const name = va[i];
    if (i == 0) {
      const ctx = gtpl.getContext(name);
      createGetterAndSetter(ctx, va, bind);
      if (ctx != gtpl) {
        // si se añade el bind a otro contexto, hay que almacenar el contexto original
        bind.gtpl = gtpl;
        // almacenamos en el contexto original una referencia al contexto donde se almacena el bind
        if (!gtpl.BindMap) gtpl.BindMap = new Map();
        gtpl.BindMap.set(bind, ctx);
        addBind2Object(ctx, va, bind);
        return;
      }
    }
    if (ref[name] == undefined)
      ref[name] = {};
    if (i < n - 1) {
      ref = ref[name];
      if (ref.tree == undefined) ref.tree = {};
      ref = ref.tree;
    } else {
      ref = ref[name];
    }
  }
  if (ref.me == undefined) {
    ref.me = new Set();
  }
  ref.me.add(bind);
}

function getBind2Object(
  gtpl: IGtplObject,
  va: TplVar,
  bind: IBindObject
): Set<IBindObject> {
  /*
    if (bind.gtpl && bind.gtpl != gtpl) {
        console.error('getBind2Object', 2);
        const original_gtpl = bind.gtpl;
        delete bind.gtpl;
        return getBind2Object(original_gtpl, va, bind);
    }
    */
  /*
     if (gtpl.BindMap && gtpl.BindMap.has(bind)) {
         console.error('getBind2Object', 1);
         const ctx_gtpl = gtpl.BindMap.get(bind);
         if (ctx_gtpl && ctx_gtpl != gtpl) {
             gtpl.BindMap.delete(bind);
             return getBind2Object(ctx_gtpl, va, bind);
         }
     }
     */
  let ref: any = gtpl.BindTree;
  for (let i = 0, n = va.length; i < n; i++) {
    const name = va[i];
    if (i < n - 1) {
      ref = ref[name];
      ref = ref.tree;
    } else {
      ref = ref[name];
    }
  }
  return ref.me;
}

function delBind(gtpl: IGtplObject, bind: IBindObject) {
  if (bind.link.vorc && bind.link.vorc.va) {
    getBind2Object(gtpl, bind.link.vorc.va, bind).delete(bind);
  }
  if (bind.link.formula?.vars) {
    bind.link.formula.vars.forEach((va) => {
      getBind2Object(gtpl, va, bind).delete(bind);
    });
  }
  if (bind.simetric && bind.ele) {
    const setBindings = simetricAttr.get(bind.ele);
    if (setBindings) {
      // Filtramos fuera todas las entradas cuyo ctx sea este GTpl
      const nuevo = new Set(
        Array.from(setBindings)
          .filter(item => item.ctx !== gtpl)
      );
      if (nuevo.size) {
        simetricAttr.set(bind.ele, nuevo);
      } else {
        simetricAttr.delete(bind.ele);
      }
    }
  }
}

function searchBind(gtpl: IGtplObject, bind: IBindObject): boolean {
  let encontrado = false;
  if (bind.link.vorc && bind.link.vorc.va) {
    if (getBind2Object(gtpl, bind.link.vorc.va, bind).has(bind))
      encontrado = true;
  }
  if (bind.link.formula?.vars) {
    bind.link.formula.vars.forEach((va) => {
      if (getBind2Object(gtpl, va, bind).has(bind)) encontrado = true;
    });
  }
  if (!encontrado) {
    const re: Set<IBindObject> = privateProperties.getProperty(
      gtpl,
      "renderElements"
    );
    if (re.has(bind)) re.delete(bind);
  }
  return encontrado;
}

//---

function checkBindVar(gtpl: IGtplObject, bind: IBindObject): boolean {
  if (bind.type == BindTypes.VAR) {
    //log('checkBindVar', gtpl, bind);
    if (bind.link.svar && bind.link.vorc && bind.link.vorc.va) {
      const temp = bind.link.vorc.va.join("");
      if (temp == "this") {
        bind.ele[bind.link.svar] = gtpl.Root;
      } else {
        bind.ele[bind.link.svar] = reduceVar(gtpl, bind.link.vorc.va);
      }
    }
    return true;
  }
  return false;
}

function checkBindEvent(gtpl: IGtplObject, bind: IBindObject): boolean {
  if (bind.type == BindTypes.EVENT && bind.prop) {
    //log('checkBindEvent', gtpl, bind);
    const ctx: IGtplObject = getContext(gtpl, bind);
    const obj = { gtpl: ctx, bind: bind };
    const options: any = { passive: false };
    if (["wheel", "mousewheel", "touchstart", "touchmove"].includes(bind.prop.toLowerCase()))
      options.passive = true;
    //---
    const handler = async function (event: any) {
      const result = await calculateBind(obj.gtpl, obj.bind, undefined, event);
      //console.error(result, obj.bind, event);
      if (typeof result == "function") {
        if (obj.bind.link.params) {
          const arrval: any = [];
          obj.bind.link.params.forEach((param) => {
            if (param.ct != undefined) arrval.push(param.ct);
            else if (param.va != undefined)
              arrval.push(reduceVar(gtpl, param.va));
          });
          result.apply(obj.gtpl.Root, [event, ...arrval]);
        } else {
          result.apply(obj.gtpl.Root, [event]);
        }
      } else {
        if (result === false) {
          if (event.preventDefault)
            event.preventDefault();
          if (event.stopPropagation)
            event.stopPropagation();
        }
      }
    };
    //---
    bind.ele.addEventListener(
      bind.prop,
      handler,
      passiveSupported ? options : false
    );
    //---
    if (!bind.ele[ElementReferenceIndex])
      bind.ele[ElementReferenceIndex] = [];
    bind.ele[ElementReferenceIndex].push(handler);
    //---
    return true;
  }
  return false;
}

function checkBindFormula(gtpl: IGtplObject, bind: IBindObject): boolean {
  let result = false;
  if (bind.link.formula && bind.link.formula.vars && bind.link.formula.vars.length) {
    result = true;
    bind.link.formula.vars.forEach((va) => {
      addBind2Object(gtpl, va, bind);
    });
  }
  return result;
}

function checkSimetricBind(gtpl: IGtplObject, bind: IBindObject) {
  if (
    bind.type == BindTypes.ATTR &&
    bind.prop &&
    bind.link &&
    bind.link.vorc &&
    bind.link.vorc.va
  ) {
    const { prop } = bind;
    if (prop.startsWith('[') && prop.endsWith(']')) {
      //---
      initChangeEvents();
      //---
      bind.simetric = true;
      bind.prop = prop.slice(1, - 1);
      //---
      const va = bind.link.vorc.va;
      const ctx: any = gtpl.getContext(va[0]);
      //---
      if (bind.prop == "value") {
        if (!simetricAttr.has(bind.ele)) simetricAttr.set(bind.ele, new Set());
        simetricAttr.get(bind.ele)?.add({
          va: va,
          ctx: ctx,
        });
      }
      //---
      if (bind.prop in bind.ele.constructor.prototype) {
        const original: any = Object.getOwnPropertyDescriptor(
          bind.ele.constructor.prototype,
          bind.prop
        );
        if (original) {
          Object.defineProperty(bind.ele, bind.prop, {
            get: function () {
              //console.log('get', bind, this, original.get.call(this));
              return original.get.call(this);
            },
            set: function (value) {
              //console.log('set', bind, this, value);
              if (
                bind.prop == "value" &&
                bind.ele.nodeName.toLowerCase() == "select"
              ) {
                const ret = original.set.call(this, value);
                if (original.get.call(this) == value)
                  updateVar(va, ctx, value);
                else console.error("select value not valid", value + ' not in options');
                return ret;
              } else {
                updateVar(va, ctx, value);
                return original.set.call(this, value);
              }
            },
          });
        } else {
          console.error("simetric attr error", bind.prop, " not in ", bind.ele.constructor.prototype);
        }
      } else {
        console.error("simetric attr error", bind.prop, " in ", bind.ele);
      }
      //---
    }
  }
}

function checkBind(gtpl: IGtplObject, bind: IBindObject): boolean {
  let result = false;
  if (bind.link.vorc && bind.link.vorc.va) {
    result = true;
    checkSimetricBind(gtpl, bind);
    addBind2Object(gtpl, bind.link.vorc.va, bind);
  }
  if (bind.link.functions) {
    bind.link.functions.forEach((fnc: IFunction) => {
      if (fnc.params) {
        fnc.params.forEach((param: IVarOrConst) => {
          if (param.va) {
            result = true;
            addBind2Object(gtpl, param.va, bind);
          }
        });
      }
    });
  }
  return result;
}

//---

function removeElements(elements: any) {
  if (Array.isArray(elements)) {
    elements.forEach((element) => {
      removeElements(element);
    });
  } else {
    if (elements[ElementReferenceIndex]) {
      elements[ElementReferenceIndex].forEach((handler: any) => {
        globalObject.removeEventListener(elements, handler);
      });
      delete elements[ElementReferenceIndex];
    }
    if (elements.destroy) {
      elements.destroy(true);
    } else {
      elements.parentNode?.removeChild(elements);
    }
  }
}

//---

function iterBind(
  btree: any,
  type: TypeEventProxyHandler,
  path: string[],
  value?: any,
  arr: any[] = [],
  depth: number = 0,            //–– posición actual en `path`
): any[] {
  if (!btree) return arr;
  // 1) Procesar los binds en este nodo
  if (btree.me) {
    btree.me.forEach((bind: IBindObject) => {
      // Para los binds en la raíz (depth=0) pasamos el `value`, 
      // en niveles inferiores sólo pasamos `undefined`
      const bindValue = (depth === 0 ? value : undefined);
      // Copiamos sólo el trozo relevante de `path` a partir de `depth`
      const subPath = path.slice(depth);
      arr.push([type, bind, subPath, bindValue]);
    });
  }
  // 2) Recorrer subárboles
  if (btree.tree) {
    const keyAtDepth = path[depth];
    for (const key in btree.tree) {
      // Si no hay path (depth >= path.length) o coincide la clave, continuamos
      if (keyAtDepth === undefined || keyAtDepth === key) {
        // Calculamos el nuevo `value` para la rama:
        const nextValue =
          value !== undefined
            ? (keyAtDepth === undefined ? value : (value as any)[key])
            : undefined;
        // Llamada recursiva incrementando `depth`
        iterBind(
          btree.tree[key],
          type,
          path,
          nextValue,
          arr,
          depth + 1
        );
      }
    }
  }
  return arr;
}

//---

function checkMarkEle(gtpl: IGtplObject, bind: IBindObject, bresult: boolean) {
  // si hay varios tipos de bindados a un mismo elemento, if + switch por ejemplo
  // hay que hacer que solo se genere en una ocasión, y el otro coja los elementos
  // generados por el que primero llegue.
  if (bresult) {
    const MarkEle = privateProperties.getProperty(gtpl, "MarkEle");
    const memValues = privateProperties.getProperty(gtpl, "memValues");
    if (!bind.ele) {
      if (bind.mark) {
        if (bind.gen) {
          if (MarkEle.has(bind.mark)) {
            bind.ele = MarkEle.get(bind.mark);
          } else {
            bind.ele = (<Function>bind.gen)(bind.gtpl ? bind.gtpl : gtpl);
            MarkEle.set(bind.mark, bind.ele);
          }
          delete bind.gen;
        } else {
          if (MarkEle.has(bind.mark)) {
            bind.ele = MarkEle.get(bind.mark);
            memValues.delete(bind);
          }
        }
      }
    } else if (MarkEle.has(bind.mark)) {
      if (bind.ele != MarkEle.get(bind.mark)) {
        bind.ele = MarkEle.get(bind.mark);
        memValues.delete(bind);
      }
    }
  }
}

function checkMarkRender(bind: IBindObject) {
  let allok = true;
  if (bind.mark.checks) {
    for (let i in bind.mark.checks) {
      if (!bind.mark.checks[i]) {
        allok = false;
        break;
      }
    }
  }
  return allok;
}

/*
function checkValSelect(parentElement: HTMLElement, childElement: HTMLElement) {
    try {
        if (parentElement.nodeName && parentElement.nodeName.toLowerCase() == 'select' &&
            childElement.nodeName && childElement.nodeName.toLowerCase() == 'option') {
            console.log('checkValSelect', parentElement, childElement);
            if ((parentElement as HTMLSelectElement).value !== '' &&
                (parentElement as HTMLSelectElement).value === (childElement as HTMLOptionElement).value) {
                (childElement as HTMLOptionElement).selected = true;
            }
        }
    } catch (ex) { console.error(ex); }
}
*/

function show(bind: IBindObject, remove: boolean = true) {
  if (bind.ele) {
    if (Array.isArray(bind.ele)) {
      bind.ele.forEach((ele) => {
        bind.mark.parentNode.insertBefore(ele, bind.mark);
        //checkValSelect(bind.mark.parentNode, ele);
      });
    } else {
      bind.mark.parentNode.insertBefore(bind.ele, bind.mark);
      //checkValSelect(bind.mark.parentNode, bind.ele);
    }
    if (remove) bind.mark.remove();
  }
}

function hide(bind: IBindObject, insert: boolean = true) {
  if (bind.ele) {
    if (Array.isArray(bind.ele)) {
      if (insert) bind.ele[0].parentNode.insertBefore(bind.mark, bind.ele[0]);
      bind.ele.forEach((ele) => {
        ele.remove();
      });
    } else {
      if (insert) bind.ele.parentNode.insertBefore(bind.mark, bind.ele);
      bind.ele.remove();
    }
  }
}

function renderBind(gtpl: IGtplObject, bind: IBindObject, render: boolean) {
  const index = getElementIndex(gtpl, bind);
  const canrender = checkMarkRender(bind);
  if (render && canrender) {
    if (index >= 0) gtpl.RenderElements[index] = bind;
    if (bind.mark.parentNode) show(bind);
    else if (index >= 0 && searchBind(gtpl, bind))
      addCheckRenderElement(gtpl, bind);
  } else {
    if (index >= 0) delete gtpl.RenderElements[index];
    if (bind.ele.parentNode) hide(bind);
    else if (index >= 0 && searchBind(gtpl, bind))
      addCheckRenderElement(gtpl, bind);
  }
  if (render && !canrender) return false;
  return true;
}

function getElementIndex(gtpl: IGtplObject, bind: IBindObject) {
  // si la marca se encuentra en el array de elementos, quiere decir que su padre
  // es el padre de la marca, si va ser un elemento del dom puede existir posibilidad
  // de que el parentelement de la marca aún no exista, en ese caso, tenemos el array
  // renderelements donde pondremos los elementos a renderizar en el mismo nivel que su marca
  const index = gtpl.Elements.indexOf(bind.mark);
  if (index >= 0) {
    if (!gtpl.RenderElements) {
      //gtpl.RenderElements = Array(gtpl.Elements.length).fill(null);
      gtpl.RenderElements = {};
    }
  }
  return index;
}

function createGTpl(
  gtpl: IGtplObject,
  bind: IBindObject,
  objindex?: IIndex,
  elementos?: IGtplObject[],
  row?: any,
  refresh?: boolean /*, objparent: any*/
) {
  const options: any = {
    parent: bind.gtpl ? bind.gtpl : gtpl,
    generator: bind.gen,
  };
  if (objindex && elementos && row) {
    const obj: any = {};
    obj[objindex.index] = elementos.length;
    obj[objindex.target] = row;
    //obj[SPARENT] = objparent;
    options.context = [objindex.index, objindex.target];
    options.root = obj;
  }
  if (refresh !== undefined) {
    options.refresh = refresh;
  }
  return new GTpl(options);
}

//---

async function updateTEXTbind(
  type: TypeEventProxyHandler,
  gtpl: IGtplObject,
  bind: IBindObject,
  result?: any,
  path?: string[]
) {
  //log('TEXT', bind, result, path);
  //---
  gtpl = getContext(gtpl, bind);
  //---
  const memValues = privateProperties.getProperty(gtpl, "memValues");
  if (result !== undefined && result !== null) {
    if (memValues.has(bind) && memValues.get(bind) == result) {
      return gtpl;
    }
    memValues.set(bind, result);
  }
  //---
  bind.ele.textContent = result;
  //---
  return gtpl;
}

async function updateATTRbind(
  type: TypeEventProxyHandler,
  gtpl: IGtplObject,
  bind: IBindObject,
  result?: any,
  path?: string[]
) {
  gtpl = getContext(gtpl, bind);
  const updateProperty = (prop: string, value: any) => {
    if (bind.ele[prop] !== undefined && bind.ele[prop] !== null) {
      if (value === undefined || value === null) {
        if (bind.ele[prop] !== "")
          bind.ele[prop] = null;
      } else if (bind.ele[prop] != value) {
        try {
          bind.ele[prop] = value;
        } catch (ex) {
          STACK((<any>ex).message, bind.ele, prop);
        }
      }
    } else {
      if (value === undefined || value === null) {
        bind.ele.removeAttribute(prop);
      } else if (bind.ele.getAttribute(prop) != value) {
        bind.ele.setAttribute(prop, value);
      }
    }
  };
  if (bind.prop) {
    updateProperty(bind.prop, result);
  } else {
    if (result === undefined || result === null) {
      if (bind.attrs) {
        bind.attrs.forEach((key) => {
          updateProperty(key, null);
        });
        delete bind.attrs;
      }
    } else {
      if (!bind.attrs)
        bind.attrs = [];
      const missing = bind.attrs.filter(key => !(key in result));
      missing.forEach((key) => {
        updateProperty(key, null);
      });
      bind.attrs.length = 0;
      for (let key in result) {
        bind.attrs.push(key);
        updateProperty(key, result[key]);
      }
    }
  }
  return gtpl;
}

async function updateINNERbind(type: TypeEventProxyHandler,
  gtpl: IGtplObject,
  bind: IBindObject,
  result?: any,
  path?: string[]
) {
  gtpl = getContext(gtpl, bind);
  if (result !== undefined && bind.ele.innerHTML != result)
    bind.ele.innerHTML = result;
  return gtpl;
}

async function updateSTYLEbind(
  type: TypeEventProxyHandler,
  gtpl: IGtplObject,
  bind: IBindObject,
  result?: any,
  path?: string[]
) {
  //log('STYLE', bind, result, path);
  //---
  gtpl = getContext(gtpl, bind);
  //---
  const memValues = privateProperties.getProperty(gtpl, "memValues");
  if (memValues.has(bind) && memValues.get(bind) == result) return gtpl;
  memValues.set(bind, result);
  //---
  if (bind.prop) {
    bind.ele.style[bind.prop] = result;
  }
  //---
  return gtpl;
}

async function updateIFbind(
  type: TypeEventProxyHandler,
  gtpl: IGtplObject,
  bind: IBindObject,
  result?: any,
  path?: string[]
) {
  //log('IF/NOTIF', bind, result, path);
  //---
  gtpl = getContext(gtpl, bind);
  //---
  const bresult = bind.type == BindTypes.NOTIF ? !result : !!result;
  //---
  if (!bind.mark.checks) bind.mark.checks = {};
  bind.mark.checks[bind.type] = bresult;
  //---
  checkMarkEle(gtpl, bind, bresult);
  //---
  if (!bind.ele) {
    return gtpl;
  }
  //---
  const memValues = privateProperties.getProperty(gtpl, "memValues");
  if (memValues.has(bind) && memValues.get(bind) === bresult) return gtpl;
  //---
  if (renderBind(gtpl, bind, bresult)) memValues.set(bind, bresult);
  //---
  return gtpl;
}

async function updateFORbind(
  type: TypeEventProxyHandler,
  gtpl: IGtplObject,
  bind: IBindObject,
  result?: any,
  path?: string[]
) {
  //console.log('FOR', type, bind, result, path);
  //---
  gtpl = getContext(gtpl, bind);
  //---
  //if (!searchBind(gtpl, bind)) {
  //    return;
  //}
  //---
  if (!bind.eles) bind.eles = [];
  //---
  const elementos = bind.eles;
  const objindex: IIndex = <IIndex>bind.link.index;
  //---
  const render_arr: any = [];
  const delete_arr: any = [];
  //---
  const index: any = (Array.isArray(path) && path.length) ? path[0] : undefined;
  //---
  if (!isNaN(index)) {
    const ppath: any = path;
    if (type == TypeEventProxyHandler.SET) {
      let update = false;
      if (ppath.length > 1) {
        update = true;
      } else if (ppath.length == 1 && elementos.length == result.length) {
        const newgtpl = elementos[index];
        newgtpl.Root[objindex.target] = result[index];
        return gtpl;
      }
      if (update) {
        const newgtpl = elementos[index];
        ppath.shift();
        updateVar(
          ppath,
          <any>{ Root: newgtpl.Root[objindex.target] },
          reduceVar(gtpl, ppath, result[index]),
          true
        );
      } else {
        const newgtpl = createGTpl(
          gtpl,
          bind,
          objindex,
          elementos,
          result[index],
          false
        );
        elementos.push(newgtpl);
        render_arr.push([newgtpl, index]);
      }
    }
    if (type == TypeEventProxyHandler.UNSET) {
      if (ppath.length > 1) {
        const newgtpl = elementos[index];
        newgtpl.Root[objindex.target] = result[index];
      } else {
        const newgtpl: IGtplObject = elementos.splice(index, 1)[0];
        delete_arr.push([newgtpl, index]);
      }
    }
  } else if (result && result.length) {
    if (index == 'length' && elementos.length == result.length)
      return gtpl;
    result.forEach((row: any, index: number) => {
      if (index >= elementos.length) {
        const newgtpl = createGTpl(
          gtpl,
          bind,
          objindex,
          elementos,
          row,
          false /*, result*/
        );
        elementos.push(newgtpl);
        render_arr.push([newgtpl, index]);
      } else {
        const obj: any = elementos[index].Root;
        obj[objindex.target] = row;
      }
    });
    if (elementos.length > result.length) {
      const gtpls = elementos.splice(
        result.length,
        elementos.length - result.length
      );
      gtpls.forEach((newgtpl, index: number) => {
        delete_arr.push([newgtpl, index]);
      });
    }
  } else if (elementos.length) {
    elementos.forEach((newgtpl, index: number) => {
      delete_arr.push([newgtpl, index]);
    });
    elementos.length = 0;
  }
  //---
  if (delete_arr.length) {
    delete_arr.forEach((rowinfo: any) => {
      const [newgtpl, index] = rowinfo;
      newgtpl.destroy();
      gtpl.GtplChilds.delete(newgtpl);
    });
  }
  //---
  if (render_arr.length) {
    //---
    const renderindex = getElementIndex(gtpl, bind);
    if (renderindex >= 0) {
      if (!gtpl.RenderElements[renderindex]) {
        gtpl.RenderElements[renderindex] = bind;
      }
    }
    //---
    const all: any = [];
    render_arr.forEach((rowinfo: any) => {
      const [newgtpl, index] = rowinfo;
      newgtpl.addTo(all);
      gtpl.GtplChilds.add(newgtpl);
    });
    //---
    if (bind.mark.parentNode) {
      //---
      show(
        {
          type: bind.type,
          link: bind.link,
          ele: all,
          mark: bind.mark,
        },
        false
      );
      //---
      render_arr.forEach((rowinfo: any) => {
        rowinfo[0].refresh();
      });
      //---
    } else if (renderindex >= 0 && searchBind(gtpl, bind)) {
      addCheckRenderElement(gtpl, bind);
    }
    //---
  }
  //---
  return gtpl;
}

async function updateSWITCHbind(
  type: TypeEventProxyHandler,
  gtpl: IGtplObject,
  bind: IBindObject,
  result?: any,
  path?: string[]
) {
  //log('SWITCH', bind, result, path);
  //---
  gtpl = getContext(gtpl, bind);
  //---
  const bresult = result !== undefined && result !== null ? true : false;
  //---
  if (!bind.mark.checks) bind.mark.checks = {};
  bind.mark.checks[bind.type] = bresult;
  //---
  checkMarkEle(gtpl, bind, bresult);
  //---
  if (!bind.mark.checks) bind.mark.checks = {};
  bind.mark.checks[bind.type] = result == undefined ? false : true;
  //---
  if (!bind.ele) {
    return gtpl;
  }
  //---
  const memValues = privateProperties.getProperty(gtpl, "memValues");
  if (memValues.has(bind) && memValues.get(bind) === result) {
    return gtpl;
  }
  memValues.set(bind, result);
  //---
  if (bind.case && bind.case.length) {
    //---
    if (bind.eles && bind.eles.length) {
      bind.eles.forEach((gtplcase: IGtplObject) => {
        hide((<any>gtplcase).refCase);
        gtplcase.destroy();
        gtpl.GtplChilds.delete(gtplcase);
      });
      delete bind.eles;
    }
    //---
    if (!searchBind(gtpl, bind)) {
      return gtpl;
    }
    //---
    if (bresult) {
      //---
      if (!bind.case[0].mark) {
        //---
        const mcobj: any = {};
        //---
        for (let i = 0, n = bind.ele.childNodes.length; i < n; i++) {
          const node = bind.ele.childNodes[i];
          if (node.nodeType === 8) {
            if (node.textContent.length == 6) {
              mcobj[node.textContent] = node;
            }
          }
        }
        //---
        for (let i = 0, n = bind.case.length; i < n; i++) {
          const ca = bind.case[i];
          if (!ca.mark && ca.uid) {
            ca.mark = mcobj[ca.uid];
          }
        }
        //---
      }
      //---
      for (let i = 0, n = bind.case.length; i < n; i++) {
        const ca = bind.case[i];
        const valca = await calculateBind(gtpl, ca);
        if (valca == result) {
          const gtplcase = createGTpl(
            gtpl,
            ca,
            undefined,
            undefined,
            undefined,
            false
          );
          ca.ele = gtplcase.Elements;
          ca.eles = [gtplcase];
          (<any>gtplcase).refCase = ca;
          gtpl.GtplChilds.add(gtplcase);
          //console.error('GtplChilds', gtpl.GtplChilds.size);
          bind.eles = ca.eles;
          break;
        }
      }
      //---
    }
    //---
  }
  //---
  if (renderBind(gtpl, bind, bresult)) {
    if (bresult) {
      (<any>bind.eles)[0].refresh();
      show((<any>bind.eles)[0].refCase);
    }
  }
  //---
  return gtpl;
}

async function updateISbind(
  type: TypeEventProxyHandler,
  gtpl: IGtplObject,
  bind: IBindObject,
  result?: any,
  path?: string[]
) {
  //log('IS', bind, result, path);
  //---
  gtpl = getContext(gtpl, bind);
  //---
  const bresult = result !== undefined && result !== null ? true : false;
  //---
  const memValues = privateProperties.getProperty(gtpl, "memValues");
  if (memValues.has(bind) && memValues.get(bind) == result) return gtpl;
  memValues.set(bind, result);
  //---
  let check = false;
  if (bind.eles) {
    check = true;
    bind.eles[0].destroy();
    gtpl.GtplChilds.delete(bind.eles[0]);
    delete bind.eles;
  } else if (bind.ele) {
    hide(bind);
  }
  //---
  if (!bresult) return gtpl;
  //---
  if (check && !searchBind(gtpl, bind)) {
    return gtpl;
  }
  //---
  if (Array.isArray(result) || typeof result == "function") {
    const newgtpl = createGTpl(gtpl, {
      link: bind.link,
      type: bind.type,
      gtpl: bind.gtpl,
      gen: result,
    });
    bind.eles = [newgtpl];
    gtpl.GtplChilds.add(newgtpl);
    bind.ele = newgtpl.Elements;
  } else {
    bind.ele = result;
  }
  //---
  privateProperties.getProperty(gtpl, "MarkEle").set(bind.mark, bind.ele);
  //---
  renderBind(gtpl, bind, bresult);
  //---
  return gtpl;
}

//---

export class GTpl implements IGtplObject {
  ID!: string;

  /**
   * Referencia a la función generadora.
   */
  FncElements!: Function | Array<any>;

  /**
   * Array de array de elementos html que forman la plantilla
   */
  Elements!: Node[];

  /**
   * Objeto indexado a los elementos dinamicos de ka plantillas, for, switch etc...
   */
  RenderElements!: any;

  /**
   * Es el arbol de objetos bindados siguiendo la misma ramificación que en el arbol html.
   */
  BindTree!: any;

  /**
   * Son los objetos bindados con constantes, no dinámicos.
   */
  BindConst!: Set<IBindObject>;

  /**
   * Mapa de objetos bindados a plantillas diferentes a la original.
   * Por ejemplo: cuando se tiene una plantilla dentro de otra plantilla.
   */
  BindMap!: Map<IBindObject, IGtplObject>;

  /**
   * Son las claves de primer nivel de objetos bindados a la plantilla.
   */
  BindDef!: Set<IBindDef>;

  /**
   * Plantillas hijas.
   */
  GtplChilds!: Set<IGtplObject>;

  /**
   * Plantilla padre.
   */
  Parent!: IGtplObject;

  /**
   * Utilizado para localizar el contexto de la variable que se solicita.
   */
  Context!: Set<String>;

  /**
   * Objeto referencia para aplicar a la plantilla.
   */
  Root: any;

  BoundEventProxy: EventFunctionProxyHandler;

  cleanupCallbacks!: Set<() => void>;

  isDestroyed: boolean = false;

  constructor(options?: any) {
    //log('constructor', this, options);
    this.ID = Math.random().toString(16).slice(2);
    this.BindTree = {};
    this.BindConst = new Set();
    this.BindDef = new Set();
    this.GtplChilds = new Set();
    this.BoundEventProxy = this.eventPRoxy.bind(this);
    this.loadOptions(options);
  }

  loadOptions(options?: any) {
    if (options) {
      this.Root = options.root;
      if (options.parent) this.Parent = options.parent;
      if (options.context) this.Context = new Set(options.context);
      if (options.generator) {
        this.FncElements = options.generator;
        this.Elements = [];
        GAddToo(this.Elements, this.FncElements, this);
      }
      privateProperties.setProperty(this, "GenerationFinish", true);
      if (options.refresh === undefined || options.refresh === true)
        this.refresh();
    }
  }

  getValue(key: any): any {
    const ref = this.Root;
    if (ref) {
      if (ref.hasOwnProperty(key)) return ref[key];
      if (ref[key] !== undefined) return ref[key];
    }
    if (this.Parent) return this.Parent.getValue(key);
    return undefined;
  }

  getGtplRoot(): GTpl {
    if (this.Parent) return this.Parent.getGtplRoot();
    return this;
  }

  getRoot(): any {
    if (this.Parent) return this.Parent.getRoot();
    return this.Root;
  }

  getContext(key: string): GTpl {
    if (this.Context && this.Context.has(key)) return this;
    if (this.Parent) return this.Parent.getContext(key);
    return this.getGtplRoot();
  }

  addBind(bind: IBindObject) {
    if (this.checkDestroyed('addBind')) return;
    if (!checkBindVar(this, bind))
      if (!checkBindEvent(this, bind))
        if (!checkBindFormula(this, bind))
          if (!checkBind(this, bind))
            this.BindConst.add(bind);
    if (privateProperties.getProperty(this, "GenerationFinish")) {
      this.launchChange(TypeEventProxyHandler.UKNOW4, bind);
    }
  }

  private checkDestroyed(operation: string): boolean {
    if (this.isDestroyed) {
      console.warn(`[GTPL] Cannot perform ${operation} on destroyed component`, this.ID);
      return true;
    }
    return false;
  }

  destroy(elements = true) {

    if (this.isDestroyed) {
      console.warn('[GTPL] Component already destroyed', this.ID);
      return;
    }

    if (this.cleanupCallbacks && this.cleanupCallbacks.size > 0) {
      this.cleanupCallbacks.forEach(callback => {
        try {
          callback();
        } catch (error) {
          console.error('[GTPL] Error in cleanup callback:', error);
        }
      });
      this.cleanupCallbacks.clear();
    }

    this.isDestroyed = true;

    this.GtplChilds.forEach(child => child.destroy(false));

    this.GtplChilds.clear();

    if (this.BindDef) {
      for (const objdef of this.BindDef) {
        removeEventHandler(objdef.val, this.BoundEventProxy);
      }
      this.BindDef.clear();
    }

    if (this.BindMap) {
      for (const [bind, ctxgtpl] of this.BindMap) {
        delBind(ctxgtpl, bind);
      }
      this.BindMap.clear();
    }

    if (elements) {
      removeElements(this.Elements);
      if (this.RenderElements) {
        const entries = Array.isArray(this.Elements) ? this.Elements.length : 1;
        for (let index = 0; index < entries; index++) {
          const bind: IBindObject = this.RenderElements[index];
          if (bind) {
            if (bind.ele)
              removeElements(bind.ele);
            if (bind.eles)
              removeElements(bind.eles);
          }
        }
        this.RenderElements = null;
      }
    }

    // Cleanup total
    this.Elements = null!;
    this.Root = null!;
    this.BindTree = null!;
    this.BindConst = null!;
    this.Context = null!;
    this.Parent = null!;
  }

  onCleanup(callback: () => void): void {
    if (this.isDestroyed) {
      return;
    }
    if (typeof callback !== 'function') {
      return;
    }
    if (!this.cleanupCallbacks) {
      this.cleanupCallbacks = new Set();
    }
    this.cleanupCallbacks.add(callback);
  }

  refresh() {
    for (let objdef of this.BindDef) {
      this.eventPRoxy(TypeEventProxyHandler.UKNOW4, [], undefined, objdef);
    }
    if (this.BindMap) {
      for (let [bind, gtpl] of this.BindMap) {
        gtpl.launchChange(TypeEventProxyHandler.UKNOW5, bind);
      }
    }
    if (this.BindConst) {
      for (let bind of this.BindConst) {
        this.launchChange(TypeEventProxyHandler.UKNOW6, bind);
      }
    }
  }

  addTo(ele: Node | any[]) {
    if (this.checkDestroyed('addBind')) return;
    //console.log('addTo', ele);
    if (this.RenderElements) {
      const render_arr: any = [];
      const arr = Array.isArray(this.Elements)
        ? this.Elements
        : [this.Elements];
      arr.forEach((ele: Node, index: number) => {
        if (this.RenderElements[index]) {
          const bind: IBindObject = this.RenderElements[index];
          if (bind.ele) {
            render_arr.push(bind.ele);
          } else if (bind.eles) {
            bind.eles.forEach((gtpl: IGtplObject) => gtpl.addTo(render_arr));
            render_arr.push(bind.mark);
          }
        } else {
          render_arr.push(ele);
        }
      });
      GAddToo(ele, render_arr, this);
    } else {
      GAddToo(ele, this.Elements, this);
    }
  }

  eventPRoxy(
    type: TypeEventProxyHandler,
    path: PathProxyHandler,
    value: any,
    objRef: any
  ) {
    //log('eventPRoxy', 'event:', type, 'path:', path, 'value:', value, 'objref:', objRef);
    const pa = path;
    pa?.shift();
    iterBind(this.BindTree[objRef.key], type, path, value, [], 1).forEach((args: any) =>
      this.launchChange.apply(this, args)
    );
  }

  async launchChange(
    type: TypeEventProxyHandler,
    bind: IBindObject,
    path?: string[],
    value?: any
  ) {
    if (this.checkDestroyed('launchChange')) return;
    if (BindTypes.EVENT == bind.type)
      return;
    const result = await calculateBind(this, bind, value);
    let gtpl: IGtplObject = this;
    switch (bind.type) {
      case BindTypes.TEXT:
        gtpl = await updateTEXTbind(type, this, bind, result, path);
        break;
      case BindTypes.ATTR:
        gtpl = await updateATTRbind(type, this, bind, result, path);
        break;
      case BindTypes.INNER:
        gtpl = await updateINNERbind(type, this, bind, result, path);
        break;
      case BindTypes.STYLE:
        gtpl = await updateSTYLEbind(type, this, bind, result, path);
        break;
      case BindTypes.IF:
      case BindTypes.NOTIF:
        gtpl = await updateIFbind(type, this, bind, result, path);
        break;
      case BindTypes.FOR:
        gtpl = await updateFORbind(type, this, bind, result, path);
        break;
      case BindTypes.SWITCH:
        gtpl = await updateSWITCHbind(type, this, bind, result, path);
        break;
      case BindTypes.IS:
        gtpl = await updateISbind(type, this, bind, result, path);
        break;
    }
    checkRenderElements(gtpl, bind);
  }
}
