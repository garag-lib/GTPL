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

const proxyCache = new WeakMap<object, { proxy: any; revoke: () => void }>();
const handlersMap = new WeakMap<object, Set<EventFunctionProxyHandler>>();

const fakeEventHandler: EventFunctionProxyHandler = () => { }; // siempre la misma

export function isGProxy(obj: any): obj is { [ISPROXY]: true;[PROXYTARGET]: any } {
  return !!obj && typeof obj === 'object' && ISPROXY in obj;
}

function getProxyHandler(
  targetOriginal: any,
  objRef: any,
  parentPath: PathProxyHandler = []
): ProxyHandler<any> {
  return {
    get(target, prop, receiver) {
      if (prop === ISPROXY) return true;
      if (prop === PROXYTARGET) return targetOriginal;
      if (prop === Symbol.iterator) {
        const origIter = (target as any)[Symbol.iterator].bind(target);
        return function* () {
          for (const item of origIter()) {
            yield (isStaticType(item) || isGProxy(item))
              ? item
              : createGProxy(item, fakeEventHandler, objRef, [...parentPath, Symbol.iterator]);
          }
        };
      }
      const val = Reflect.get(target, prop, receiver);
      if (isStaticType(val) || isGProxy(val)) return val;
      return createGProxy(val, fakeEventHandler, objRef, [...parentPath, prop]);
    },
    set(target, prop, value, receiver) {
      if (isGProxy(value)) {
        value = (value as any)[PROXYTARGET];
      }
      const ok = Reflect.set(target, prop, value, receiver);
      const handlers = handlersMap.get(targetOriginal);
      handlers?.forEach(handler => handler(TypeEventProxyHandler.SET, [...parentPath, prop], value, objRef));
      return ok;
    },
    deleteProperty(target, prop) {
      const ok = Reflect.deleteProperty(target, prop);
      const handlers = handlersMap.get(targetOriginal);
      handlers?.forEach(handler => handler(TypeEventProxyHandler.UNSET, [...parentPath, prop], undefined, objRef));
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

function createGProxy<T extends object>(
  target: T,
  event: EventFunctionProxyHandler,
  objRef: any,
  parentPath: PathProxyHandler = []
): T {
  if (isStaticType(target)) return target;
  const existing = proxyCache.get(target);
  if (existing) {
    // sigue vivo mientras tenga handlers
    handlersMap.get(target)!.add(event);
    return existing.proxy;
  }
  // primera vez que lo vemos: creamos revocable + handler set
  const handler = getProxyHandler(target, objRef, parentPath);
  const { proxy, revoke } = Proxy.revocable(target, handler);
  proxyCache.set(target, { proxy, revoke });
  handlersMap.set(target, new Set([event]));
  return proxy;
}

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

export function removeEventHandler(target: any, event: EventFunctionProxyHandler) {
  if (isGProxy(target)) {
    target = (target as any)[PROXYTARGET];
  }
  const handlers = handlersMap.get(target);
  if (handlers) {
    handlers.delete(event);
    if (handlers.size === 0) {
      // 1) quito también del mapa de handlers
      handlersMap.delete(target);
      // 2) revoco el proxy y luego borro la entrada en proxyCache
      const entry = proxyCache.get(target);
      if (entry) {
        entry.revoke();
        proxyCache.delete(target);
      }
    }
  }
}
