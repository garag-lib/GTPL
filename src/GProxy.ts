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

export function isGProxy(obj: any): obj is { [ISPROXY]: true;[PROXYTARGET]: any } {
  return !!obj && typeof obj === 'object' && ISPROXY in obj;
}

function getProxyHandler(
  event: EventFunctionProxyHandler,
  objRef: any,
  parentPath: PathProxyHandler = []
): ProxyHandler<any> {
  return {
    get(target, prop, receiver) {
      if (prop === ISPROXY) return true;
      if (prop === PROXYTARGET) return target;
      if (prop === Symbol.iterator) {
        const origIter = (target as any)[Symbol.iterator].bind(target);
        return function* () {
          for (const item of origIter()) {
            yield (isStaticType(item) || isGProxy(item))
              ? item
              : createGProxy(item, event, objRef, [...parentPath, Symbol.iterator]);
          }
        };
      }
      const val = Reflect.get(target, prop, receiver);
      if (isStaticType(val) || isGProxy(val)) return val;
      return createGProxy(val, event, objRef, [...parentPath, prop]);
    },

    set(target, prop, value, receiver) {
      // Desempaquetar si es proxy
      if (isGProxy(value))
        value = (value as any)[PROXYTARGET];
      const ok = Reflect.set(target, prop, value, receiver);
      event(TypeEventProxyHandler.SET, [...parentPath, prop], value, objRef);
      return ok;
    },

    deleteProperty(target, prop) {
      const ok = Reflect.deleteProperty(target, prop);
      event(TypeEventProxyHandler.UNSET, [...parentPath, prop], undefined, objRef);
      return ok;
    },

    has(target, prop) {
      return Reflect.has(target, prop);
    },

    ownKeys(target) {
      return Reflect.ownKeys(target);
    },

    getOwnPropertyDescriptor(target, prop) {
      return Reflect.getOwnPropertyDescriptor(target, prop);
    }
  };
}

/**
 * Crea o recupera un Proxy para un objeto dado, sin usar WeakMaps:
 */
function createGProxy<T extends object>(
  target: T,
  event: EventFunctionProxyHandler,
  objRef: any,
  parentPath: PathProxyHandler = []
): T {
  const handler = getProxyHandler(event, objRef, parentPath);
  return new Proxy(target, handler);
}

// Alias para compatibilidad
export const GProxy = createGProxy;

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

export function pathToString(path: PathProxyHandler): string {
  return path.map(String).join('.');
}
