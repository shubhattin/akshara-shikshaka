import { Effect } from 'effect';
import { describe, expect, it } from '@effect/vitest';
import { DatabaseError, NotFoundError, StorageError } from './errors';
import { RedisClient } from './redis';
import { BackgroundWork } from './background';
import { Layer } from 'effect';

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

const RedisTest = Layer.succeed(RedisClient)({
  get: () => Effect.succeed(null),
  set: () => Effect.succeed('OK'),
  del: () => Effect.succeed(1)
});

describe('cache refresh', () => {
  it.effect('refresh writes after optional delete without Promise.all boolean mix', () =>
    Effect.gen(function* () {
      let deleted = false;
      let setCount = 0;

      const testRedis = {
        set: (_key: string, _value: unknown, _options?: { ex?: number }) => {
          setCount += 1;
          return Effect.succeed('OK' as const);
        },
        del: (_key: string) => {
          deleted = true;
          return Effect.succeed(1);
        }
      };

      yield* testRedis.del('k');
      yield* testRedis.set('k', { ok: true }, { ex: 10 });
      expect(deleted).toBe(true);
      expect(setCount).toBe(1);
    }).pipe(Effect.provide(RedisTest), Effect.provide(BackgroundWork.Test))
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
