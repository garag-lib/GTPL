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

function getProxyHandler(event: EventFunctionProxyHandler, ojRef: any, parent?: PathProxyHandler) {
  const ProxyHandler = {
    get: (target: any, prop: any, receiver: any): any => {
      if (prop == ISPROXY)
        return true;
      if (prop == PROXYTARGET)
        return target;
      const ret = Reflect.get(target, prop, receiver);
      if (isStaticType(ret)) {
        return ret;
      }
      if (!(<any>ret)[ISPROXY]) {
        return GProxy(ret, event, ojRef, [parent, prop]);
      }
      return ret;
    },
    set: (target: any, prop: any, value: any) => {
      //const oldvalue: any = Reflect.get(target, prop);
      if (!isStaticType(value))
        while (value[ISPROXY]) value = value[PROXYTARGET];
      const ret: any = Reflect.set(target, prop, value);
      //if (Array.isArray(target)) {
      //  if (!isNaN(prop))
      event(TypeEventProxyHandler.SET, [parent, prop], value, ojRef);
      //} else {
      //  event(TypeEventProxyHandler.SET, [parent, prop], value, ojRef);
      //}
      return ret;
    },
    deleteProperty: (target: any, prop: any) => {
      //console.log('deleteProperty');
      //const oldvalue: any = Reflect.get(target, prop);
      const ret = Reflect.deleteProperty(target, prop);
      //const isarray = Array.isArray(target);
      event(TypeEventProxyHandler.UNSET, [parent, prop], undefined, ojRef);
      return ret;
    }
    //ownKeys
    //has
    //defineProperty
    //getOwnPropertyDescriptor
  };
  return ProxyHandler;
}

export function GProxy(target: any, event: EventFunctionProxyHandler, objRef: any, parent?: PathProxyHandler) {
  return new Proxy(target, getProxyHandler(event, objRef, parent));
}

export function pathToArray(path: PathProxyHandler, arr: any[] = []): any[] {
  path.forEach(function (p: any) {
    if (Array.isArray(p)) {
      pathToArray(p, arr);
    } else {
      arr.push(p);
    }
  });
  return arr;
}

export function pathToString(path: PathProxyHandler, arr: any[] = []): String {
  return pathToArray(path, arr).join('.');
}

export function* iterPath(path: PathProxyHandler): any {
  for (let i = 0, n = path.length; i < n; i++) {
    const p = path[i];
    if (Array.isArray(p))
      yield* iterPath(p);
    else yield p;
  }
}
