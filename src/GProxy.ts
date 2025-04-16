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

function isProxy(obj: any): obj is { [ISPROXY]: true; [PROXYTARGET]: any } {
  return obj && typeof obj === 'object' && ISPROXY in obj;
}

function getProxyHandler(event: EventFunctionProxyHandler, objRef: any, parentPath: PathProxyHandler = []) {
  const ProxyHandler = {

    get(target: any, prop: any, receiver: any): any {
      if (prop === ISPROXY) return true;
      if (prop === PROXYTARGET) return target;
      const ret = Reflect.get(target, prop, receiver);
      if (isStaticType(ret)) return ret;
      if (!(ret && ret[ISPROXY])) {
        return GProxy(ret, event, objRef, [...parentPath, prop]);
      }
      return ret;
    },

    set(target: any, prop: any, value: any): boolean {
      if (!isStaticType(value))
        while (isProxy(value)) value = value[PROXYTARGET];
      const result = Reflect.set(target, prop, value);
      event(TypeEventProxyHandler.SET, [...parentPath, prop], value, objRef);
      return result;
    },

    deleteProperty(target: any, prop: any): boolean {
      const result = Reflect.deleteProperty(target, prop);
      event(TypeEventProxyHandler.UNSET, [...parentPath, prop], undefined, objRef);
      return result;
    },

    has(target: any, prop: any): boolean {
      return Reflect.has(target, prop);
    },

    ownKeys(target: any): (string | symbol)[] {
      return Reflect.ownKeys(target);
    },

    getOwnPropertyDescriptor(target: any, prop: any): PropertyDescriptor | undefined {
      return Reflect.getOwnPropertyDescriptor(target, prop);
    }

  };
  return ProxyHandler;
}

export function GProxy(target: any, event: EventFunctionProxyHandler, objRef: any, parentPath: PathProxyHandler = []): any {
  return new Proxy(target, getProxyHandler(event, objRef, parentPath));
}

export function unGProxy<T = any>(obj: T): T {
  if (isProxy(obj))
    obj = obj[PROXYTARGET];
  if (Array.isArray(obj))
    return obj.map(unGProxy) as any;
  if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        result[key] = unGProxy(obj[key]);
      }
    }
    return result;
  }
  return obj;
}

export function pathToString(path: PathProxyHandler): string {
  return path.map(String).join('.');
}
