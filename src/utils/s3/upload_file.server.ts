/**
 * Legacy Promise wrappers — prefer `ObjectStorage` from `~/effect/storage`.
 */
import { Effect } from 'effect';
import type { PROJECT_S3_ALIAS } from '@/constants';
import { appRuntime } from '~/effect/runtime';
import { ObjectStorage, type AssetLocation } from '~/effect/storage';

export const uploadAssetFile = async (key: AssetLocation, fileBuffer: Buffer) =>
  appRuntime.runPromise(
    Effect.gen(function* () {
      const storage = yield* ObjectStorage;
      return yield* storage.uploadAssetFile(key, fileBuffer);
    })
  );

export const deleteAssetFile = async (key: string) =>
  appRuntime.runPromise(
    Effect.gen(function* () {
      const storage = yield* ObjectStorage;
      return yield* storage.deleteAssetFile(key);
    })
  );

export const getAudioAssetUploadUrl = async (
  key: `${typeof PROJECT_S3_ALIAS}/audio_assets/${string}.webm`
) =>
  appRuntime.runPromise(
    Effect.gen(function* () {
      const storage = yield* ObjectStorage;
      return yield* storage.getAudioAssetUploadUrl(key);
    })
  );
