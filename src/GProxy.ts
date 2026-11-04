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
// Keep raw identity available after revocation for in-flight render results.
// Weak keys do not retain proxies once callers release them.
const proxyTargets = new WeakMap<object, object>();

interface ProxySubscription {
  event: EventFunctionProxyHandler;
  objRef: any;
  parentPath: PathProxyHandler;
  node?: SubscriptionPath;
}

const subscriptionsMap = new WeakMap<object, ProxySubscription[]>();
const subscriptionTargets = new WeakMap<object, Set<object>>();
interface SubscriptionPath {
  children: Map<PropertyKey, SubscriptionPath>;
  targets: Set<object>;
}
const subscriptionPaths = new WeakMap<object, Map<EventFunctionProxyHandler, SubscriptionPath>>();

function newSubscriptionPath(): SubscriptionPath {
  return { children: new Map(), targets: new Set() };
}

function subscriptionNode(objRef: object, event: EventFunctionProxyHandler, path: PathProxyHandler): SubscriptionPath {
  let events = subscriptionPaths.get(objRef);
  if (!events) subscriptionPaths.set(objRef, events = new Map());
  let node = events.get(event);
  if (!node) events.set(event, node = newSubscriptionPath());
  for (const part of path) {
    let child: SubscriptionPath | undefined = node.children.get(part);
    if (!child) node.children.set(part, child = newSubscriptionPath());
    node = child;
  }
  return node;
}

function unindexSubscription(target: object, subscription: ProxySubscription): void {
  if (!isWeakMapKey(subscription.objRef)) return;
  const events = subscriptionPaths.get(subscription.objRef);
  let node = events?.get(subscription.event);
  if (!node) return;
  const ancestors: SubscriptionPath[] = [node];
  for (const part of subscription.parentPath) {
    node = node.children.get(part);
    if (!node) return;
    ancestors.push(node);
  }
  node.targets.delete(target);
  for (let i = ancestors.length - 1; i > 0; i--) {
    if (ancestors[i].targets.size || ancestors[i].children.size) break;
    ancestors[i - 1].children.delete(subscription.parentPath[i - 1]);
  }
  if (!ancestors[0].targets.size && !ancestors[0].children.size) events!.delete(subscription.event);
  if (!events!.size) subscriptionPaths.delete(subscription.objRef);
}

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
  parentPath: PathProxyHandler,
  node?: SubscriptionPath
): void {
  const indexed = isWeakMapKey(objRef);
  if (indexed) {
    node = node || subscriptionNode(objRef, event, parentPath);
    if (node.targets.has(target)) return;
  }
  let subscriptions = subscriptionsMap.get(target);
  if (!subscriptions) {
    subscriptions = [];
    subscriptionsMap.set(target, subscriptions);
  }
  if (indexed || !subscriptions.some(subscription =>
    subscription.event === event &&
    subscription.objRef === objRef &&
    pathsEqual(subscription.parentPath, parentPath)
  )) {
    const subscription = { event, objRef, parentPath: parentPath.slice(), node };
    subscriptions.push(subscription);
    node?.targets.add(target);
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
    if (subscription.node) {
      let child = subscription.node.children.get(prop);
      if (!child) subscription.node.children.set(prop, child = newSubscriptionPath());
      if (!child.targets.has(value))
        addProxySubscription(value, subscription.event, subscription.objRef, [...subscription.parentPath, prop], child);
      proxy = getOrCreateProxy(value);
    } else {
      proxy = GProxy(value, subscription.event, subscription.objRef, [...subscription.parentPath, prop]);
    }
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
          if (Array.isArray(target) && origIter === Array.prototype[Symbol.iterator]) {
            for (let index = 0; index < target.length; index++)
              yield proxyChild(targetOriginal, target[index], String(index));
            return;
          }
          for (const item of origIter.call(target)) {
            yield proxyChild(targetOriginal, item, Symbol.iterator);
          }
        };
      }
      const val = Reflect.get(target, prop, receiver);
      return proxyChild(targetOriginal, val, prop);
    },
    set(target, prop, value, receiver) {
      value = toRaw(value);
      //---
      const prev = Reflect.get(target, prop, receiver);
      if (isStaticType(prev) && Object.is(prev, value)) {
        const own = Reflect.getOwnPropertyDescriptor(target, prop);
        if (own && 'value' in own && own.writable && receiver === proxyCache.get(targetOriginal)?.proxy)
          return true;
      }
      //---
      const previousLength = Array.isArray(target) ? target.length : undefined;
      const previousKeys = previousLength !== undefined && prop === 'length'
        && (typeof value !== 'number' || value < previousLength) ? Reflect.ownKeys(target) : undefined;
      const ok = Reflect.set(target, prop, value, receiver);
      const length = previousLength === undefined ? undefined : target.length;
      if (ok || (previousLength !== undefined && length !== previousLength)) {
        const removedKeys = previousKeys?.filter(key => !Reflect.getOwnPropertyDescriptor(target, key));
        const subscriptions = subscriptionsMap.get(targetOriginal)?.slice() ?? [];
        if (ok && isWeakMapKey(prev) && toRaw(prev) !== toRaw(Reflect.get(target, prop, receiver)))
          removeChildSubscriptions(subscriptions, prop);
        removedKeys?.forEach(key => removeChildSubscriptions(subscriptions, key));
        subscriptions.forEach(subscription => subscription.event(
          TypeEventProxyHandler.SET,
          [...subscription.parentPath, prop],
          ok ? value : Reflect.get(target, prop, receiver),
          subscription.objRef
        ));
        // Indexed writes grow arrays before push() assigns the already-current length.
        if (prop !== 'length' && previousLength !== undefined && length !== previousLength) {
          subscriptions.forEach(subscription => subscription.event(
            TypeEventProxyHandler.SET,
            [...subscription.parentPath, 'length'],
            length,
            subscription.objRef
          ));
        }
        // Array length writes delete indexed properties without entering deleteProperty.
        removedKeys?.forEach(key => subscriptions.forEach(subscription => subscription.event(
          TypeEventProxyHandler.UNSET,
          [...subscription.parentPath, key],
          undefined,
          subscription.objRef
        )));
      }
      return ok;
    },
    deleteProperty(target, prop) {
      const previous = Reflect.getOwnPropertyDescriptor(target, prop);
      const ok = Reflect.deleteProperty(target, prop);
      if (ok) {
        const subscriptions = subscriptionsMap.get(targetOriginal)?.slice() ?? [];
        if (previous)
          removeChildSubscriptions(subscriptions, prop);
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
  objRef?: any,
  pathPrefix?: PathProxyHandler
): void {
  if (isGProxy(target)) {
    target = (target as any)[PROXYTARGET];
  }
  const subscriptions = subscriptionsMap.get(target);
  if (!subscriptions) {
    return;
  }
  const remaining: ProxySubscription[] = [];
  let removed = false, ownerSurvives = false;
  let removedOwners: Set<object> | undefined;
  for (const subscription of subscriptions) {
    if (subscription.event === event && (objRef === undefined || subscription.objRef === objRef) &&
      (!pathPrefix || (subscription.parentPath.length >= pathPrefix.length &&
        pathPrefix.every((part: any, index: number) => subscription.parentPath[index] === part)))) {
      removed = true;
      unindexSubscription(target, subscription);
      if (objRef === undefined && isWeakMapKey(subscription.objRef))
        (removedOwners || (removedOwners = new Set())).add(subscription.objRef);
    } else {
      remaining.push(subscription);
      if (subscription.objRef === objRef) ownerSurvives = true;
    }
  }
  if (!removed) return;
  const removeOwnerTarget = (owner: object) => {
    const targets = subscriptionTargets.get(owner);
    targets?.delete(target);
    if (targets?.size === 0) subscriptionTargets.delete(owner);
  };
  if (isWeakMapKey(objRef) && !ownerSurvives) removeOwnerTarget(objRef);
  if (removedOwners) {
    for (const subscription of remaining) removedOwners.delete(subscription.objRef);
    removedOwners.forEach(removeOwnerTarget);
  }
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

function removeChildSubscriptions(subscriptions: ProxySubscription[], prop: PropertyKey): void {
  for (const subscription of subscriptions) {
    if (!isWeakMapKey(subscription.objRef)) continue;
    const prefix = [...subscription.parentPath, prop];
    let node = subscriptionPaths.get(subscription.objRef)?.get(subscription.event);
    for (const part of prefix) node = node?.children.get(part);
    if (!node) continue;
    const targets = new Set<object>();
    const pending = [node];
    while (pending.length) {
      const current = pending.pop()!;
      current.targets.forEach(target => targets.add(target));
      current.children.forEach(child => pending.push(child));
    }
    for (const target of targets)
      removeSubscriptionsFromTarget(target, subscription.event, subscription.objRef, prefix);
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
  addProxySubscription(target, event, objRef, Array.isArray(parentPath) ? parentPath : []);
  return getOrCreateProxy(target);
}

function getOrCreateProxy<T extends object>(target: T): T {
  const existing = proxyCache.get(target);
  if (existing) {
    return existing.proxy;
  }
  // primera vez que lo vemos: creamos un proxy compartido por sus suscripciones
  const handler = getProxyHandler(target);
  const { proxy, revoke } = Proxy.revocable(target, handler);
  proxyCache.set(target, { proxy, revoke });
  proxyTargets.set(proxy, target);
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
  while (isWeakMapKey(current)) {
    const target = proxyTargets.get(current);
    if (target) {
      current = target;
    } else if (isGProxy(current)) {
      current = current[PROXYTARGET];
    } else {
      break;
    }
  }
  return current;
}

export function pathToString(path: PathProxyHandler): string {
  return path.map(String).join('.');
}
