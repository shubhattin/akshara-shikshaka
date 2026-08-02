import { z } from 'zod';
import { Effect } from 'effect';
import { and, asc, count, desc, eq, ilike } from 'drizzle-orm';
import { audio_assets } from '~/db/schema';
import { get_lang_from_id } from '~/state/lang_list';
import { PROJECT_S3_ALIAS } from '~/constants';
import { AiProvider, VoiceTypeEnum, type VoiceType } from '~/effect/ai';
import { ObjectStorage } from '~/effect/storage';
import { Database } from '~/effect/database';
import { CACHE, invalidateAndRefreshCache } from '~/effect/cache';
import { DatabaseError } from '~/effect/errors';
import { t, protectedAdminProcedure } from '../trpc_init';
import { runTrpcEffect } from '~/effect/run';
import { dev_delay } from '~/tools/delay';

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
    `${PROJECT_S3_ALIAS}/audio_assets/${input.text_key}_${input.lang_id ? get_lang_from_id(input.lang_id) + '_' : ''}${crypto.randomUUID()}.${fileType}` as `${typeof PROJECT_S3_ALIAS}/audio_assets/${string}.opus`;

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
    yield* Effect.forEach(
      Array.from(lesson_ids),
      (lesson_id) =>
        invalidateAndRefreshCache({
          cache: CACHE.lessons.text_lesson_info,
          params: { lesson_id }
        }).pipe(
          Effect.catch((error) =>
            Effect.logWarning('lesson cache refresh failed', { lesson_id, error }).pipe(
              Effect.asVoid
            )
          )
        ),
      { concurrency: 4 }
    );
  }

  return { deleted: true as const };
});

const list_audio_assets_route = protectedAdminProcedure
  .input(
    z.object({
      search_text: z.string().optional(),
      sort_by: z.enum(['created_at', 'updated_at']).optional(),
      order_by: z.enum(['asc', 'desc']).optional().prefault('desc'),
      page: z.int().min(1),
      limit: z.int().min(1),
      lang_id: z.int().optional().nullable()
    })
  )
  .query(async ({ input }) => {
    await dev_delay(400);
    return runTrpcEffect(
      Effect.gen(function* () {
        const database = yield* Database;
        const whereClause = (() => {
          const conds = [];
          const trimmed = input.search_text?.trim();
          if (trimmed && trimmed.length > 0) {
            conds.push(ilike(audio_assets.description, `%${trimmed}%`));
          }
          if (input.lang_id !== null && input.lang_id !== undefined) {
            conds.push(eq(audio_assets.lang_id, input.lang_id));
          }
          return and(...conds);
        })();
        const offset = (input.page - 1) * input.limit;

        const countEffect = database.run('count_audio_assets', async (db) =>
          db
            .select({ count: count() })
            .from(audio_assets)
            .where(whereClause ?? undefined)
        );
        const listEffect = database.run('list_audio_assets', async (db) =>
          db
            .select({
              id: audio_assets.id,
              description: audio_assets.description,
              type: audio_assets.type,
              lang_id: audio_assets.lang_id,
              s3_key: audio_assets.s3_key,
              created_at: audio_assets.created_at,
              updated_at: audio_assets.updated_at
            })
            .from(audio_assets)
            .where(whereClause ?? undefined)
            .orderBy(() => [
              (input.order_by === 'asc' ? asc : desc)(
                (input.sort_by ?? 'created_at') === 'updated_at'
                  ? audio_assets.updated_at
                  : audio_assets.created_at
              )
            ])
            .limit(input.limit)
            .offset(offset)
        );

        const [countResult, list] = yield* Effect.all([countEffect, listEffect], {
          concurrency: 2
        });
        const total = Number(countResult[0]?.count ?? 0);
        const pageCount = Math.max(1, Math.ceil(total / input.limit));
        return {
          list,
          total,
          page: input.page,
          pageCount,
          hasPrev: input.page > 1,
          hasNext: input.page < pageCount
        };
      })
    );
  });

const make_upload_audio_asset_route = protectedAdminProcedure
  .input(
    z.object({
      lang_id: z.int().optional().nullable(),
      text: z.string(),
      text_key: z.string(),
      voice: VoiceTypeEnum,
      voice_language: z.string()
    })
  )
  .mutation(async ({ input }) => {
    await dev_delay(400);
    return runTrpcEffect(uploadAudioAsset(input));
  });

const delete_audio_asset_route = protectedAdminProcedure
  .input(z.object({ id: z.int() }))
  .mutation(async ({ input }) => runTrpcEffect(deleteAudioAsset(input)));

const get_upload_audio_asset_url_route = protectedAdminProcedure
  .input(
    z.object({
      lang_id: z.int().optional().nullable(),
      text: z.string(),
      text_key: z.string()
    })
  )
  .mutation(async ({ input }) =>
    runTrpcEffect(
      Effect.gen(function* () {
        const storage = yield* ObjectStorage;
        const s3_key =
          `${PROJECT_S3_ALIAS}/audio_assets/${input.text_key}_${input.lang_id ? get_lang_from_id(input.lang_id) + '_' : ''}${crypto.randomUUID()}.webm` as const;
        const upload_url = yield* storage.getAudioAssetUploadUrl(s3_key);
        return { upload_url, s3_key };
      })
    )
  );

const complete_upload_audio_asset_route = protectedAdminProcedure
  .input(
    z.object({
      lang_id: z.int().optional().nullable(),
      text: z.string(),
      text_key: z.string(),
      s3_key: z.string()
    })
  )
  .mutation(async ({ input }) =>
    runTrpcEffect(
      Effect.gen(function* () {
        const database = yield* Database;
        const description = `${input.text} (${input.text_key})`;
        const result = yield* database.run('complete_upload_audio_asset', async (db) => {
          const [row] = await db
            .insert(audio_assets)
            .values({
              description,
              lang_id: input.lang_id,
              s3_key: input.s3_key,
              type: 'recorded'
            })
            .returning();
          return row;
        });
        if (!result) {
          return yield* Effect.fail(
            DatabaseError.make({
              operation: 'complete_upload_audio_asset',
              cause: new Error('Insert returned no row')
            })
          );
        }
        return {
          completed: true as const,
          id: result.id,
          s3_key: input.s3_key,
          description,
          type: 'recorded' as const
        };
      })
    )
  );

const update_audio_asset_route = protectedAdminProcedure
  .input(
    z.object({
      id: z.int(),
      description: z.string(),
      lang_id: z.int().optional().nullable()
    })
  )
  .mutation(async ({ input: { id, description, lang_id } }) =>
    runTrpcEffect(
      Effect.gen(function* () {
        const database = yield* Database;
        yield* database.run('update_audio_asset', async (db) => {
          await db
            .update(audio_assets)
            .set({ description, lang_id })
            .where(eq(audio_assets.id, id));
        });
        return { updated: true as const };
      })
    )
  );

export const audio_assets_router = t.router({
  list_audio_assets: list_audio_assets_route,
  upload_audio_asset: make_upload_audio_asset_route,
  delete_audio_asset: delete_audio_asset_route,
  update_audio_asset: update_audio_asset_route,
  get_upload_audio_asset_url: get_upload_audio_asset_url_route,
  complete_upload_audio_asset: complete_upload_audio_asset_route
});
