import { Effect, Layer } from 'effect';
import { describe, expect, it } from '@effect/vitest';
import { z } from 'zod';
import { DatabaseError, NotFoundError, RedisError, StorageError, isKnownError } from './errors';
import { RedisClient } from './redis';
import { BackgroundWork } from './background';
import { Database, type DbClient, type DbTransaction } from './database';
import { createCache, invalidateAndRefreshCache } from './cache';

describe('Effect infrastructure', () => {
  it.effect('maps StorageError tags', () =>
    Effect.gen(function* () {
      yield* Effect.void;
      const error = StorageError.make({
        operation: 'uploadAssetFile',
        key: 'x.webp',
        cause: new Error('network')
      });
      expect(error._tag).toBe('StorageError');
      expect(error.operation).toBe('uploadAssetFile');
    })
  );

  it.effect('maps NotFoundError tags', () =>
    Effect.gen(function* () {
      yield* Effect.void;
      const error = NotFoundError.make({
        resource: 'text_lesson',
        message: 'Text lesson not found'
      });
      expect(error._tag).toBe('NotFoundError');
    })
  );

  it.effect('recognizes known errors via Schema.is', () =>
    Effect.gen(function* () {
      yield* Effect.void;
      const found = NotFoundError.make({
        resource: 'text_lesson',
        message: 'Text lesson not found'
      });
      const storage = StorageError.make({
        operation: 'uploadAssetFile',
        cause: new Error('network')
      });
      expect(isKnownError(found)).toBe(true);
      expect(isKnownError(storage)).toBe(true);
      expect(isKnownError(new Error('plain'))).toBe(false);
      expect(isKnownError({ _tag: 'NotFoundError', resource: 'x', message: 'y' })).toBe(false);
    })
  );
});

describe('cache refresh', () => {
  it.effect('refresh writes after optional delete via createCache', () =>
    Effect.gen(function* () {
      const ops: string[] = [];
      // oxlint-disable-next-line anti-slop/no-known-value-widening -- test helper holds untyped redis cache slot; unknown models generic external payload
      let stored: unknown = null;

      const TrackingRedis = Layer.succeed(RedisClient)({
        get: () => Effect.succeed(null),
        set: (_key, value) => {
          ops.push('set');
          stored = value;
          return Effect.succeed('OK');
        },
        del: () => {
          ops.push('del');
          return Effect.succeed(1);
        }
      });

      const UnusedDb = Layer.succeed(Database)({
        run: () => Effect.fail(DatabaseError.make({ operation: 'unused', cause: 'unused' })),
        transaction: () => Effect.fail(DatabaseError.make({ operation: 'unused', cause: 'unused' }))
      });

      const cache = createCache({
        keyPrefix: 'test_list',
        schema: z.object({ lang_id: z.number() }),
        keyBuilder: ({ lang_id }) => `${lang_id}`,
        fetch: () => Effect.succeed([{ id: 1, name: 'A' }])
      });

      yield* cache
        .refresh({ lang_id: 1 }, { deleteFirst: true })
        .pipe(Effect.provide(TrackingRedis), Effect.provide(UnusedDb));

      expect(ops).toEqual(['del', 'set']);
      expect(stored).toEqual([{ id: 1, name: 'A' }]);
    }).pipe(Effect.provide(BackgroundWork.Test))
  );

  it.effect('invalidates synchronously before scheduling refresh-ahead', () =>
    Effect.gen(function* () {
      const ops: string[] = [];
      // oxlint-disable-next-line anti-slop/no-unknown-returns -- test queue holds generic background work; unknown models arbitrary async result
      const queuedWork: Array<() => Promise<unknown>> = [];
      const TrackingRedis = Layer.succeed(RedisClient)({
        get: () => Effect.succeed(null),
        set: () => {
          ops.push('set');
          return Effect.succeed('OK');
        },
        del: () => {
          ops.push('del');
          return Effect.succeed(1);
        }
      });
      const TestDatabase = Layer.succeed(Database)({
        run: <A>(_operation: string, _run: (client: DbClient) => Promise<A>) =>
          Effect.fail(DatabaseError.make({ operation: 'unused', cause: 'unused' })),
        transaction: <A>(_operation: string, _run: (tx: DbTransaction) => Promise<A>) =>
          Effect.fail(DatabaseError.make({ operation: 'unused', cause: 'unused' }))
      });
      const QueuedBackgroundWork = Layer.succeed(BackgroundWork)({
        enqueue: (work) =>
          Effect.sync(() => {
            queuedWork.push(work);
          })
      });
      const cache = createCache({
        keyPrefix: 'test_list',
        schema: z.object({ lang_id: z.number() }),
        keyBuilder: ({ lang_id }) => `${lang_id}`,
        fetch: () => Effect.succeed([{ id: 1, name: 'A' }])
      });

      yield* invalidateAndRefreshCache({
        cache,
        params: { lang_id: 1 }
      }).pipe(
        Effect.provide(TrackingRedis),
        Effect.provide(TestDatabase),
        Effect.provide(QueuedBackgroundWork)
      );

      expect(ops).toEqual(['del']);
      expect(queuedWork).toHaveLength(1);
      yield* Effect.promise(() => queuedWork[0]!());
      expect(ops).toEqual(['del', 'set']);
    })
  );

  it.effect('queues refresh-ahead even when delete fails', () =>
    Effect.gen(function* () {
      // oxlint-disable-next-line anti-slop/no-unknown-returns -- test queue holds generic background work; unknown models arbitrary async result
      const queuedWork: Array<() => Promise<unknown>> = [];
      const FailingRedis = Layer.succeed(RedisClient)({
        get: () => Effect.succeed(null),
        set: () => Effect.succeed('OK'),
        del: () => Effect.fail(RedisError.make({ operation: 'del', cause: 'redis down' }))
      });
      const TestDatabase = Layer.succeed(Database)({
        run: <A>(_operation: string, _run: (client: DbClient) => Promise<A>) =>
          Effect.fail(DatabaseError.make({ operation: 'unused', cause: 'unused' })),
        transaction: <A>(_operation: string, _run: (tx: DbTransaction) => Promise<A>) =>
          Effect.fail(DatabaseError.make({ operation: 'unused', cause: 'unused' }))
      });
      const QueuedBackgroundWork = Layer.succeed(BackgroundWork)({
        enqueue: (work) =>
          Effect.sync(() => {
            queuedWork.push(work);
          })
      });
      const cache = createCache({
        keyPrefix: 'test_list',
        schema: z.object({ lang_id: z.number() }),
        keyBuilder: ({ lang_id }) => `${lang_id}`,
        fetch: () => Effect.succeed([{ id: 1, name: 'A' }])
      });

      yield* invalidateAndRefreshCache({
        cache,
        params: { lang_id: 1 }
      }).pipe(
        Effect.provide(FailingRedis),
        Effect.provide(TestDatabase),
        Effect.provide(QueuedBackgroundWork)
      );

      expect(queuedWork).toHaveLength(1);
    })
  );
});

describe('delete failure semantics', () => {
  it.effect('DB delete failure prevents success result', () =>
    Effect.gen(function* () {
      const deleteDb = Effect.fail(
        DatabaseError.make({ operation: 'delete_audio_asset', cause: new Error('db down') })
      );
      const result = yield* Effect.exit(deleteDb);
      expect(result._tag).toBe('Failure');
    })
  );
});
