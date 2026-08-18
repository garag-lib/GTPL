// GProxy.ts
import { EventFunctionProxyHandler, PathProxyHandler, TypeEventProxyHandler } from './GEnums';
import { isNonProxyableObject, isStaticType } from './GUtils';

//---

/*

const localOptions = {
  useScheduler: false,
  batchDepth: 0,
  microtaskQueued: false
};

const pendingHandlers = new Set<Function>();


export function enableScheduledHandlers(enable: boolean) {
  if (!enable) {
    flushHandlers();
  }
  localOptions.useScheduler = enable;
}

export function runInBatch(fn: () => void) {
  localOptions.batchDepth++;
  try {
    fn();
  } finally {
    localOptions.batchDepth--;
    if (localOptions.batchDepth === 0 && pendingHandlers.size > 0) {
      flushHandlers();
    }
  }
}

export function flushHandlers() {
  if (localOptions.batchDepth > 0)
    return;
  if (pendingHandlers.size === 0)
    return;
  for (const handler of pendingHandlers) {
    try {
      handler();
    } catch (err) {
      console.error("[flushHandlers] Error:", err);
    }
  }
  pendingHandlers.clear();
  localOptions.microtaskQueued = false;
}

export function enqueueHandler(handler: Function) {
  if (!localOptions.useScheduler) {
    handler();
    return;
  }
  pendingHandlers.add(handler);
  if (!localOptions.microtaskQueued && localOptions.batchDepth === 0) {
    localOptions.microtaskQueued = true;
    queueMicrotask(() => {
      localOptions.microtaskQueued = false;
      flushHandlers();
    });
  }
}

*/

//---

export const ISPROXY = Symbol('is proxy');
export const PROXYTARGET = Symbol('proxy target');

const proxyCache = new WeakMap<object, { proxy: any; revoke: () => void }>();

interface ProxySubscription {
  event: EventFunctionProxyHandler;
  objRef: any;
  parentPath: PathProxyHandler;
}

const subscriptionsMap = new WeakMap<object, ProxySubscription[]>();
const subscriptionTargets = new WeakMap<object, Set<object>>();

function isWeakMapKey(value: any): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

function pathsEqual(left: PathProxyHandler, right: PathProxyHandler): boolean {
  if (left.length !== right.length)
    return false;
  return left.every((part: any, index: number) => part === right[index]);
}

function addProxySubscription(
  target: object,
  event: EventFunctionProxyHandler,
  objRef: any,
  parentPath: PathProxyHandler
): void {
  let subscriptions = subscriptionsMap.get(target);
  if (!subscriptions) {
    subscriptions = [];
    subscriptionsMap.set(target, subscriptions);
  }
  const path = Array.isArray(parentPath) ? parentPath.slice() : [];
  if (!subscriptions.some(subscription =>
    subscription.event === event &&
    subscription.objRef === objRef &&
    pathsEqual(subscription.parentPath, path)
  )) {
    subscriptions.push({ event, objRef, parentPath: path });
  }
  if (isWeakMapKey(objRef)) {
    let targets = subscriptionTargets.get(objRef);
    if (!targets) {
      targets = new Set();
      subscriptionTargets.set(objRef, targets);
    }
    targets.add(target);
  }
}

function proxyChild(target: object, value: any, prop: PropertyKey): any {
  if (isStaticType(value) || isGProxy(value) || isNonProxyableObject(value))
    return value;
  let proxy = value;
  const subscriptions = subscriptionsMap.get(target)?.slice() ?? [];
  subscriptions.forEach(subscription => {
    proxy = GProxy(
      value,
      subscription.event,
      subscription.objRef,
      [...subscription.parentPath, prop]
    );
  });
  return proxy;
}

function getProxyHandler(
  targetOriginal: any
): ProxyHandler<any> {
  return {
    get(target, prop, receiver) {
      if (prop === ISPROXY) return true;
      if (prop === PROXYTARGET) return targetOriginal;
      if (prop === Symbol.iterator) {
        const origIter = (target as any)[Symbol.iterator];
        if (typeof origIter !== 'function')
          return origIter;
        return function* () {
          for (const item of origIter.call(target)) {
            yield proxyChild(targetOriginal, item, Symbol.iterator);
          }
        };
      }
      const val = Reflect.get(target, prop, receiver);
      return proxyChild(targetOriginal, val, prop);
    },
    set(target, prop, value, receiver) {
      if (isGProxy(value)) {
        value = (value as any)[PROXYTARGET];
      }
      //---
      const prev = Reflect.get(target, prop, receiver);
      if (isStaticType(prev) && prev === value) {
        return true;
      }
      //---
      const ok = Reflect.set(target, prop, value, receiver);
      if (ok) {
        const subscriptions = subscriptionsMap.get(targetOriginal)?.slice() ?? [];
        subscriptions.forEach(subscription => subscription.event(
          TypeEventProxyHandler.SET,
          [...subscription.parentPath, prop],
          value,
          subscription.objRef
        ));
      }
      return ok;
    },
    deleteProperty(target, prop) {
      const ok = Reflect.deleteProperty(target, prop);
      if (ok) {
        const subscriptions = subscriptionsMap.get(targetOriginal)?.slice() ?? [];
        subscriptions.forEach(subscription => subscription.event(
          TypeEventProxyHandler.UNSET,
          [...subscription.parentPath, prop],
          undefined,
          subscription.objRef
        ));
      }
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

function removeSubscriptionsFromTarget(
  target: any,
  event: EventFunctionProxyHandler,
  objRef?: any
): void {
  if (isGProxy(target)) {
    target = (target as any)[PROXYTARGET];
  }
  const subscriptions = subscriptionsMap.get(target);
  if (!subscriptions) {
    return;
  }
  const removed = subscriptions.filter(subscription =>
    subscription.event === event && (objRef === undefined || subscription.objRef === objRef)
  );
  const remaining = subscriptions.filter(subscription => !removed.includes(subscription));
  removed.forEach(subscription => {
    if (!isWeakMapKey(subscription.objRef))
      return;
    if (remaining.some(item => item.objRef === subscription.objRef))
      return;
    const targets = subscriptionTargets.get(subscription.objRef);
    targets?.delete(target);
    if (targets?.size === 0)
      subscriptionTargets.delete(subscription.objRef);
  });
  if (remaining.length > 0) {
    subscriptionsMap.set(target, remaining);
  } else {
    subscriptionsMap.delete(target);
    const entry = proxyCache.get(target);
    if (entry) {
      try {
        entry.revoke();
      } catch (error) {
        console.error('[GProxy] Error revoking proxy:', error);
      }
      proxyCache.delete(target);
    }
  }
}

function removeProxyHandler(
  target: any,
  event: EventFunctionProxyHandler,
  objRef?: any
): void {
  if (isGProxy(target)) {
    target = (target as any)[PROXYTARGET];
  }
  if (objRef === undefined) {
    const owners = new Set(
      (subscriptionsMap.get(target) ?? [])
        .filter(subscription => subscription.event === event && isWeakMapKey(subscription.objRef))
        .map(subscription => subscription.objRef as object)
    );
    owners.forEach(owner => removeProxyHandler(target, event, owner));
    removeSubscriptionsFromTarget(target, event);
    return;
  }
  if (objRef !== undefined && isWeakMapKey(objRef)) {
    const targets = subscriptionTargets.get(objRef);
    if (targets) {
      Array.from(targets).forEach(item => removeSubscriptionsFromTarget(item, event, objRef));
      if (targets.size === 0)
        subscriptionTargets.delete(objRef);
      return;
    }
  }
  removeSubscriptionsFromTarget(target, event, objRef);
}

export function isGProxy(obj: any): obj is { [ISPROXY]: true;[PROXYTARGET]: any } {
  return !!obj && typeof obj === 'object' && (obj as any)[ISPROXY] === true;
}

export function GProxy<T extends object>(
  target: T,
  event: EventFunctionProxyHandler,
  objRef: any,
  parentPath: PathProxyHandler = []
): T {
  if (isStaticType(target) || isNonProxyableObject(target))
    return target;
  addProxySubscription(target, event, objRef, parentPath);
  const existing = proxyCache.get(target);
  if (existing) {
    return existing.proxy;
  }
  // primera vez que lo vemos: creamos un proxy compartido por sus suscripciones
  const handler = getProxyHandler(target);
  const { proxy, revoke } = Proxy.revocable(target, handler);
  proxyCache.set(target, { proxy, revoke });
  return proxy;
}

export function unGProxy<T = any>(
  target: T,
  event: EventFunctionProxyHandler,
  objRef?: any
): T {
  const raw = toRaw(target);
  removeProxyHandler(raw, event, objRef);
  return raw;
}

export function toRaw<T = any>(obj: T): T {
  let current: any = obj;
  while (isGProxy(current))
    current = current[PROXYTARGET];
  return current;
}

export function pathToString(path: PathProxyHandler): string {
  return path.map(String).join('.');
}
