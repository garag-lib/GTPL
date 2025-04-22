// GProxy.ts
import { TypeEventProxyHandler } from './GEnums';
import { isStaticType } from './GUtils';

export type PathProxyHandler = any;
export type EventFunctionProxyHandler = (
  type: TypeEventProxyHandler,
  path: PathProxyHandler,
  value: any,
  objRef: any
) => void;

export const ISPROXY = Symbol('is proxy');
export const PROXYTARGET = Symbol('proxy target');

// WeakMaps para cachear target ↔ proxy, y proxy → target
const targetToProxy = new WeakMap<object, any>();
const proxyToTarget = new WeakMap<any, object>();

export function isGProxy(obj: any): obj is { [ISPROXY]: true;[PROXYTARGET]: any } {
  return !!obj && typeof obj === 'object' && ISPROXY in obj;
}

function getProxyHandler(
  event: EventFunctionProxyHandler,
  objRef: any,
  parentPath: PathProxyHandler = []
): ProxyHandler<any> {
  return {

    get(target: any, prop: PropertyKey, receiver: any): any {

      if (prop === Symbol.iterator) {
        const origIter = target[Symbol.iterator].bind(target);
        return function* () {
          for (const item of origIter()) {
            // envolver cada elemento en proxy para mantener reactividad
            yield isStaticType(item) || isGProxy(item)
              ? item
              : createGProxy(item, event, objRef, [...parentPath, Symbol.iterator]);
          }
        };
      }

      if (prop === ISPROXY) return true;

      if (prop === PROXYTARGET) return target;

      const val = Reflect.get(target, prop, receiver);

      if (isStaticType(val)) return val;

      if (isGProxy(val)) return val;

      // crear (o recuperar) proxy para el valor retornado
      return createGProxy(val, event, objRef, [...parentPath, prop]);
    },

    set(target: any, prop: PropertyKey, value: any, receiver: any): boolean {
      if (isGProxy(value))
        value = proxyToTarget.get(value);
      const ok = Reflect.set(target, prop, value, receiver);
      event(TypeEventProxyHandler.SET, [...parentPath, prop], value, objRef);
      return ok;
    },

    deleteProperty(target: any, prop: PropertyKey): boolean {
      const ok = Reflect.deleteProperty(target, prop);
      event(TypeEventProxyHandler.UNSET, [...parentPath, prop], undefined, objRef);
      return ok;
    },

    /*
    defineProperty(target: any, prop: PropertyKey, descriptor: PropertyDescriptor): boolean {
      const ok = Reflect.defineProperty(target, prop, descriptor);
      event(TypeEventProxyHandler.DEFINE, [...parentPath, prop], descriptor, objRef);
      return ok;
    },
    apply(target: any, thisArg: any, args: any[]): any {
      const rawThis = isGProxy(thisArg) ? proxyToTarget.get(thisArg) : thisArg;
      const rawArgs = args.map((a: any) => isGProxy(a) ? proxyToTarget.get(a) : a);
      const res = Reflect.apply(target, rawThis, rawArgs);
      event(TypeEventProxyHandler.CALL, parentPath, { thisArg: rawThis, args: rawArgs }, objRef);
      if (res && typeof res === 'object' && !isStaticType(res) && !isGProxy(res)) {
        return createGProxy(res, event, objRef, parentPath);
      }
      return res;
    },
    */

    has(target: any, prop: PropertyKey): boolean {
      return Reflect.has(target, prop);
    },

    ownKeys(target) {
      // Incluir tanto keys string/symbol enumerables como no enumerables
      return [
        ...Reflect.ownKeys(target),
        ...Object.getOwnPropertySymbols(target)
          .filter(sym => !Reflect.ownKeys(target).includes(sym))
      ];
    },

    getOwnPropertyDescriptor(target, prop) {
      // Primero, intenta el descriptor nativo (cubre string y symbol, enumerable y no)
      const desc = Reflect.getOwnPropertyDescriptor(target, prop);
      if (desc) return desc;
      // Fallback: obtenemos todos los descriptores y lo casteamos a Record<PropertyKey,…>
      const allDesc = Object.getOwnPropertyDescriptors(target) as Record<PropertyKey, PropertyDescriptor>;
      return allDesc[prop];
    }

  };
}

/**
 * Crea o recupera un Proxy para un objeto dado.
 */
function createGProxy<T extends object>(
  target: T,
  event: EventFunctionProxyHandler,
  objRef: any,
  parentPath: PathProxyHandler = []
): T {
  // Si ya existe proxy para este target, lo devolvemos
  if (targetToProxy.has(target))
    return targetToProxy.get(target);
  const handler = getProxyHandler(event, objRef, parentPath);
  const proxy = new Proxy(target, handler);
  targetToProxy.set(target, proxy);
  proxyToTarget.set(proxy, target);
  return proxy;
}

// Alias para compatibilidad con tu API original
export const GProxy = createGProxy;

/**
 * "Desempaqueta" recursivamente cualquier proxy creado con GProxy.
 */
export function unGProxy<T = any>(obj: T): T {
  if (isGProxy(obj)) {
    obj = (obj as any)[PROXYTARGET];
  }
  if (Array.isArray(obj)) {
    return obj.map(unGProxy) as any;
  }
  if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const key of Reflect.ownKeys(obj)) {
      result[key as any] = unGProxy((obj as any)[key]);
    }
    return result;
  }
  return obj;
}

/** Convierte un path en un string “a.b.0.c” */
export function pathToString(path: PathProxyHandler): string {
  return path.map(String).join('.');
}
