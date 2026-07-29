import { z } from 'zod';
import { t, protectedAdminProcedure, runTrpcEffect } from '../trpc_init';
import { Effect } from 'effect';
import { and, asc, count, desc, eq, ilike } from 'drizzle-orm';
import { audio_assets } from '~/db/schema';
import { VoiceTypeEnum } from '~/effect/ai';
import { Database } from '~/effect/database';
import { ObjectStorage } from '~/effect/storage';
import { get_lang_from_id } from '~/state/lang_list';
import { PROJECT_S3_ALIAS } from '~/constants';
import { dev_delay } from '~/tools/delay';
import {
  deleteAudioAsset,
  uploadAudioAsset
} from '~/effect/workflows/audio_assets';

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
