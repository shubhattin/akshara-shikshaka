import { Context, Effect, Layer, Redacted } from 'effect';
import { Redis } from '@upstash/redis';
import { AppConfig } from './config';
import { RedisError } from './errors';

const tryRedis = <A>(operation: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => RedisError.make({ operation, cause })
  }).pipe(Effect.annotateLogs({ category: 'cache', operation }));

export class RedisClient extends Context.Service<
  RedisClient,
  {
    readonly get: <T = unknown>(key: string) => Effect.Effect<T | null, RedisError>;
    readonly set: (
      key: string,
      value: unknown,
      options?: { ex?: number }
    ) => Effect.Effect<unknown, RedisError>;
    readonly del: (key: string) => Effect.Effect<number, RedisError>;
  }
>()('RedisClient') {
  static readonly Live = Layer.effect(RedisClient)(
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const redis = new Redis({
        url: config.upstashRedisUrl,
        token: Redacted.value(config.upstashRedisToken)
      });

      return {
        get: <T = unknown>(key: string) => tryRedis('get', () => redis.get<T>(key)),
        set: (key: string, value: unknown, options?: { ex?: number }) =>
          tryRedis('set', () =>
            options?.ex !== undefined
              ? redis.set(key, value, { ex: options.ex })
              : redis.set(key, value)
          ),
        del: (key: string) => tryRedis('del', () => redis.del(key))
      };
    })
  );
}
