import type { GesturesCacheLoaders } from './gestures_cache';
import { gestures_cache_loaders } from './gestures_cache';
import type { LessonsCacheLoaders } from './lessons_cache';
import { lessons_cache_loaders } from './lessons_cache';
import type { UserCacheLoaders } from './user_cache';
import { user_cache_loaders } from './user_cache';

export { invalidateAndRefreshCache } from '~/effect/cache';

export type CacheLoaderRegistry = {
  lessons: LessonsCacheLoaders;
  gestures: GesturesCacheLoaders;
  user: UserCacheLoaders;
};

export const CACHE: CacheLoaderRegistry = {
  lessons: lessons_cache_loaders,
  gestures: gestures_cache_loaders,
  user: user_cache_loaders
};
