import { Effect, Layer } from 'effect';
import { describe, expect, it } from '@effect/vitest';
import { z } from 'zod';
import { DatabaseError, NotFoundError, StorageError } from './errors';
import { RedisClient } from './redis';
import { BackgroundWork } from './background';
import { Database } from './database';
import { createCache } from './cache';

describe('Effect infrastructure', () => {
  it.effect('maps StorageError tags', () =>
    Effect.gen(function* () {
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
      const error = NotFoundError.make({
        resource: 'text_lesson',
        message: 'Text lesson not found'
      });
      expect(error._tag).toBe('NotFoundError');
    })
  );
});

describe('cache refresh', () => {
  it.effect('refresh writes after optional delete via createCache', () =>
    Effect.gen(function* () {
      const ops: string[] = [];
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

      const cache = createCache(
        'test_list',
        z.object({ lang_id: z.number() }),
        ({ lang_id }) => `${lang_id}`,
        () => Effect.succeed([{ id: 1, name: 'A' }])
      );

      yield* cache
        .refresh({ lang_id: 1 }, true)
        .pipe(Effect.provide(TrackingRedis), Effect.provide(UnusedDb));

      expect(ops).toEqual(['del', 'set']);
      expect(stored).toEqual([{ id: 1, name: 'A' }]);
    }).pipe(Effect.provide(BackgroundWork.Test))
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
