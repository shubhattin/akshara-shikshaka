/**
 * Promise-facing cache API for route loaders and gradual migration.
 * Effect-native cache lives in `~/effect/cache`; tRPC routers should prefer
 * `runTrpcEffect` + Effect CACHE directly.
 */
import { CACHE as EffectCache } from '~/effect/cache';
import { appRuntime } from '~/effect/runtime';

const run = <A>(effect: Parameters<typeof appRuntime.runPromise>[0]) =>
  appRuntime.runPromise(effect) as Promise<A>;

function wrapCacheItem<TData, TParams>(item: {
  key: (params: TParams) => string;
  get: (params: TParams) => Parameters<typeof appRuntime.runPromise>[0];
  set: (data: TData, params: TParams) => Parameters<typeof appRuntime.runPromise>[0];
  delete: (params: TParams) => Parameters<typeof appRuntime.runPromise>[0];
  refresh: (params: TParams, del?: boolean) => Parameters<typeof appRuntime.runPromise>[0];
}) {
  return {
    key: item.key,
    get: (params: TParams) => run<TData>(item.get(params)),
    set: (data: TData, params: TParams) => run<void>(item.set(data, params)),
    delete: (params: TParams) => run<void>(item.delete(params)),
    refresh: (params: TParams, del?: boolean) => run<void>(item.refresh(params, del))
  };
}

export const CACHE = {
  lessons: {
    category_list: wrapCacheItem(EffectCache.lessons.category_list),
    category_lesson_list: wrapCacheItem(EffectCache.lessons.category_lesson_list),
    text_lesson_info: wrapCacheItem(EffectCache.lessons.text_lesson_info)
  },
  gestures: {
    gesture_data: wrapCacheItem(EffectCache.gestures.gesture_data)
  }
};
