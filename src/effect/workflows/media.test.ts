import { Effect, Exit, Layer } from 'effect';
import { describe, expect, it } from '@effect/vitest';
import { AiProvider } from '../ai';
import { ObjectStorage } from '../storage';
import { Database } from '../database';
import { ImageProcessor } from '../image';
import { BackgroundWork } from '../background';
import { StorageError, AiProviderError, DatabaseError } from '../errors';
import { makeUploadImageAsset } from './image_assets';
import { uploadAudioAsset } from './audio_assets';

const AiTest = Layer.succeed(AiProvider)({
  generateSpeech: () =>
    Effect.succeed({
      fileBuffer: Buffer.from('audio'),
      fileType: 'webm'
    }),
  generatePromptMetadata: () =>
    Effect.succeed({
      file_name: 'test_image',
      description: 'test desc',
      image_prompt: 'a test prompt'
    }),
  generateImage: () => Effect.succeed({ base64: Buffer.from('png').toString('base64') }),
  embedText: () => Effect.succeed([0.1, 0.2])
});

const ImageTest = Layer.succeed(ImageProcessor)({
  resizeImage: () => Effect.succeed(Buffer.from('webp'))
});

const DatabaseUnused = Layer.succeed(Database)({
  run: (operation) => Effect.fail(DatabaseError.make({ operation, cause: new Error('db unused') })),
  transaction: (operation) =>
    Effect.fail(DatabaseError.make({ operation, cause: new Error('tx unused') }))
});

describe('image upload workflow', () => {
  it.effect('returns image_upload_failed when S3 upload fails', () =>
    Effect.gen(function* () {
      const StorageFailUpload = Layer.succeed(ObjectStorage)({
        uploadAssetFile: () =>
          Effect.fail(
            StorageError.make({
              operation: 'uploadAssetFile',
              key: 'x',
              cause: new Error('upload fail')
            })
          ),
        deleteAssetFile: () => Effect.succeed({}),
        getAudioAssetUploadUrl: () => Effect.succeed('https://example.com/upload')
      });

      const result = yield* makeUploadImageAsset({
        lang_id: 1,
        word_script_id: 1,
        word: 'राम'
      }).pipe(
        Effect.provide(AiTest),
        Effect.provide(StorageFailUpload),
        Effect.provide(ImageTest),
        Effect.provide(DatabaseUnused),
        Effect.provide(BackgroundWork.Test)
      );

      expect(result).toEqual({
        success: false,
        err_code: 'image_upload_failed'
      });
    })
  );

  it.effect('cleans up S3 when DB insert fails after upload', () =>
    Effect.gen(function* () {
      let deletedS3 = false;

      const StorageWithDeleteTrack = Layer.succeed(ObjectStorage)({
        uploadAssetFile: () => Effect.succeed({}),
        deleteAssetFile: () =>
          Effect.sync(() => {
            deletedS3 = true;
            return {};
          }),
        getAudioAssetUploadUrl: () => Effect.succeed('https://example.com/upload')
      });

      const DatabaseFailInsert = Layer.succeed(Database)({
        run: (operation) =>
          Effect.fail(DatabaseError.make({ operation, cause: new Error('insert failed') })),
        transaction: (operation) =>
          Effect.fail(DatabaseError.make({ operation, cause: new Error('tx unused') }))
      });

      const exit = yield* Effect.exit(
        makeUploadImageAsset({
          lang_id: 1,
          word_script_id: 1,
          word: 'राम'
        }).pipe(
          Effect.provide(AiTest),
          Effect.provide(StorageWithDeleteTrack),
          Effect.provide(ImageTest),
          Effect.provide(DatabaseFailInsert),
          Effect.provide(BackgroundWork.Test)
        )
      );

      expect(Exit.isFailure(exit)).toBe(true);
      expect(deletedS3).toBe(true);
    })
  );
});

describe('audio upload workflow', () => {
  it.effect('fails when AI speech generation fails', () =>
    Effect.gen(function* () {
      const AiFail = Layer.succeed(AiProvider)({
        generateSpeech: () =>
          Effect.fail(
            AiProviderError.make({
              operation: 'generateSpeech',
              provider: 'openai',
              cause: new Error('tts fail')
            })
          ),
        generatePromptMetadata: () => Effect.die('unused'),
        generateImage: () => Effect.die('unused'),
        embedText: () => Effect.die('unused')
      });

      const StorageTest = Layer.succeed(ObjectStorage)({
        uploadAssetFile: () => Effect.succeed({}),
        deleteAssetFile: () => Effect.succeed({}),
        getAudioAssetUploadUrl: () => Effect.succeed('https://example.com/upload')
      });

      const exit = yield* Effect.exit(
        uploadAudioAsset({
          text: 'राम',
          text_key: 'raama',
          voice: 'alloy',
          voice_language: 'Sanskrit'
        }).pipe(Effect.provide(AiFail), Effect.provide(StorageTest), Effect.provide(DatabaseUnused))
      );
      expect(Exit.isFailure(exit)).toBe(true);
    })
  );

  it.effect('cleans up S3 when audio DB insert fails', () =>
    Effect.gen(function* () {
      let deletedS3 = false;

      const StorageWithDeleteTrack = Layer.succeed(ObjectStorage)({
        uploadAssetFile: () => Effect.succeed({}),
        deleteAssetFile: () =>
          Effect.sync(() => {
            deletedS3 = true;
            return {};
          }),
        getAudioAssetUploadUrl: () => Effect.succeed('https://example.com/upload')
      });

      const DatabaseFailInsert = Layer.succeed(Database)({
        run: (operation) =>
          Effect.fail(DatabaseError.make({ operation, cause: new Error('insert failed') })),
        transaction: (operation) =>
          Effect.fail(DatabaseError.make({ operation, cause: new Error('tx unused') }))
      });

      const exit = yield* Effect.exit(
        uploadAudioAsset({
          text: 'राम',
          text_key: 'raama',
          voice: 'alloy',
          voice_language: 'Sanskrit',
          lang_id: 1
        }).pipe(
          Effect.provide(AiTest),
          Effect.provide(StorageWithDeleteTrack),
          Effect.provide(DatabaseFailInsert)
        )
      );

      expect(Exit.isFailure(exit)).toBe(true);
      expect(deletedS3).toBe(true);
    })
  );
});
