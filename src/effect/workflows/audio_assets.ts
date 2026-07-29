import { Effect } from 'effect';
import { audio_assets } from '~/db/schema';
import { eq } from 'drizzle-orm';
import { get_lang_from_id } from '~/state/lang_list';
import { PROJECT_S3_ALIAS } from '~/constants';
import { AiProvider, type VoiceType } from '../ai';
import { ObjectStorage } from '../storage';
import { Database } from '../database';
import { BackgroundWork } from '../background';
import { CACHE } from '../cache';
import { appRuntime } from '../runtime';
import { DatabaseError } from '../errors';

export const uploadAudioAsset = Effect.fn('uploadAudioAsset')(function* (input: {
  lang_id?: number | null;
  text: string;
  text_key: string;
  voice: VoiceType;
  voice_language: string;
}) {
  const ai = yield* AiProvider;
  const storage = yield* ObjectStorage;
  const database = yield* Database;

  const start_time = Date.now();
  yield* Effect.logInfo('generating audio');

  const audioBuffer = yield* ai.generateSpeech({
    text: input.text,
    instructions:
      `Speak in a cheerful and friendly tone. Slowly and clearly. The accent of speech should be Indian. ` +
      `The Text is in ${input.voice_language} language. The word is ${input.text} (${input.text_key}).`,
    voice: input.voice
  });
  yield* Effect.logInfo('audio generated');

  const { fileBuffer, fileType } = audioBuffer;
  const s3_key =
    `${PROJECT_S3_ALIAS}/audio_assets/${input.text_key}_${input.lang_id ? get_lang_from_id(input.lang_id) + '_' : ''}${crypto.randomUUID()}.${fileType}` as `${typeof PROJECT_S3_ALIAS}/audio_assets/${string}.webm`;

  yield* storage.uploadAssetFile(s3_key, fileBuffer);
  yield* Effect.logInfo('audio uploaded', { s3_key });

  const description = `${input.text} (${input.text_key})`;

  const result = yield* database
    .run('insert_audio_asset', async (db) => {
      const [row] = await db
        .insert(audio_assets)
        .values({
          description,
          lang_id: input.lang_id,
          s3_key,
          type: 'ai_generated'
        })
        .returning();
      return row;
    })
    .pipe(
      Effect.tapError(() => storage.deleteAssetFile(s3_key).pipe(Effect.catch(() => Effect.void)))
    );

  if (!result) {
    yield* storage.deleteAssetFile(s3_key).pipe(Effect.catch(() => Effect.void));
    return yield* Effect.fail(
      DatabaseError.make({
        operation: 'insert_audio_asset',
        cause: new Error('Insert returned no row')
      })
    );
  }

  return {
    id: result.id,
    description,
    s3_key,
    type: 'ai_generated' as const,
    time_ms: Date.now() - start_time
  };
});

export const deleteAudioAsset = Effect.fn('deleteAudioAsset')(function* (input: { id: number }) {
  const database = yield* Database;
  const storage = yield* ObjectStorage;
  const background = yield* BackgroundWork;

  const result = yield* database.run('find_audio_asset', async (db) =>
    db.query.audio_assets.findFirst({
      where: (tbl) => eq(tbl.id, input.id),
      columns: {
        s3_key: true,
        id: true
      },
      with: {
        optional_lessons: {
          columns: {
            id: true
          }
        },
        words: {
          columns: {
            id: true
          },
          with: {
            lesson: {
              columns: {
                id: true
              }
            }
          }
        }
      }
    })
  );

  if (!result) {
    return {
      deleted: false as const,
      err_code: 'audio_asset_not_found' as const
    };
  }

  // Database delete is source of truth; S3 delete is best-effort after success.
  yield* database.run('delete_audio_asset', async (db) => {
    await db.delete(audio_assets).where(eq(audio_assets.id, input.id));
  });

  yield* storage.deleteAssetFile(result.s3_key).pipe(
    Effect.tapError((error) =>
      Effect.logWarning('audio S3 delete failed after DB delete', { error, key: result.s3_key })
    ),
    Effect.catch(() => Effect.void)
  );

  const lesson_ids = new Set<number>();
  result.optional_lessons.forEach((lesson) => lesson_ids.add(lesson.id));
  result.words.forEach((word) => lesson_ids.add(word.lesson.id));

  if (lesson_ids.size > 0) {
    const refresh = Effect.forEach(
      Array.from(lesson_ids),
      (lesson_id) =>
        CACHE.lessons.text_lesson_info
          .refresh({ lesson_id })
          .pipe(
            Effect.catch((error) =>
              Effect.logWarning('lesson cache refresh failed', { lesson_id, error }).pipe(
                Effect.asVoid
              )
            )
          ),
      { concurrency: 4 }
    );
    yield* background.enqueue(() => appRuntime.runPromise(refresh));
  }

  return { deleted: true as const };
});
