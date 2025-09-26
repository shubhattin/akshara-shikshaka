import { z } from 'zod';
import { t, protectedAdminProcedure } from '../trpc_init';
import { dev_delay } from '~/tools/delay';
import { and, asc, count, desc, eq, ilike } from 'drizzle-orm';
import { db } from '~/db/db';
import { audio_assets } from '~/db/schema';
import { generateGpt4oMiniTtsSpeech, VoiceTypeEnum } from '~/utils/ai/text_to_speech.server';
import {
  uploadAssetFile,
  deleteAssetFile,
  getAudioAssetUploadUrl
} from '~/utils/s3/upload_file.server';
import { get_lang_from_id } from '~/state/lang_list';

const list_audio_assets_route = protectedAdminProcedure
  .input(
    z.object({
      search_text: z.string().optional(),
      sort_by: z.enum(['created_at', 'updated_at']).optional(),
      order_by: z.enum(['asc', 'desc']).optional().default('desc'),
      page: z.number().int().min(1),
      limit: z.number().int().min(1),
      lang_id: z.number().int().optional().nullable()
    })
  )
  .query(async ({ input }) => {
    await dev_delay(400);

    const whereClause = (() => {
      const conds: ReturnType<typeof and>[] = [];
      const trimmed = input.search_text?.trim();
      const whereClause =
        trimmed && trimmed.length > 0 ? ilike(audio_assets.description, `%${trimmed}%`) : undefined;
      if (whereClause) {
        conds.push(whereClause);
      }
      if (input.lang_id !== null && input.lang_id !== undefined) {
        conds.push(eq(audio_assets.lang_id, input.lang_id));
      }
      return and(...conds);
    })();
    const [{ count: totalCount }] = await db
      .select({ count: count() })
      .from(audio_assets)
      .where(whereClause ?? undefined);
    const offset = (input.page - 1) * input.limit;
    const list = await db
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
      .orderBy((t) => {
        return [
          (input.order_by === 'asc' ? asc : desc)(
            (input.sort_by ?? 'created_at') === 'updated_at'
              ? audio_assets.updated_at
              : audio_assets.created_at
          )
        ];
      })
      .limit(input.limit)
      .offset(offset);
    const total = Number(totalCount ?? 0);
    const pageCount = Math.max(1, Math.ceil(total / input.limit));
    const hasPrev = input.page > 1;
    const hasNext = input.page < pageCount;
    return {
      list,
      total,
      page: input.page,
      pageCount,
      hasPrev,
      hasNext
    };
  });

const make_upload_audio_asset_route = protectedAdminProcedure
  .input(
    z.object({
      lang_id: z.number().int().optional().nullable(),
      text: z.string(),
      text_key: z.string(), // The "Normal" Transliterated version
      voice: VoiceTypeEnum,
      voice_language: z.string()
    })
  )
  .mutation(async ({ input }) => {
    await dev_delay(400);
    const start_time = Date.now(); // ^ for tracking the time taken to generate the audio

    const audioBuffer = await generateGpt4oMiniTtsSpeech({
      text: input.text,
      instructions:
        `Speak in a cheerful and friendly tone. Slowly and clearly. The accent of speech should be Indian. ` +
        `The Text is in ${input.voice_language} language. The word is ${input.text} (${input.text_key}).`,
      voice: input.voice
    });
    console.log('audio generated');

    const s3_key =
      `audio_assets/${input.text_key}_${input.lang_id ? get_lang_from_id(input.lang_id) + '_' : ''}${crypto.randomUUID()}.webm` as const;
    await uploadAssetFile(s3_key, audioBuffer.fileBuffer);
    console.log('audio uploaded');

    const description = `${input.text_key} (${input.text})`;
    const [result] = await db
      .insert(audio_assets)
      .values({
        description,
        lang_id: input.lang_id,
        s3_key: s3_key,
        type: 'ai_generated'
      })
      .returning();

    return {
      id: result.id,
      description,
      s3_key,
      type: 'ai_generated' as const,
      time_ms: Date.now() - start_time
    };
  });

const delete_audio_asset_route = protectedAdminProcedure
  .input(z.object({ id: z.number().int() }))
  .mutation(async ({ input }) => {
    const result = await db.query.audio_assets.findFirst({
      columns: {
        s3_key: true,
        id: true
      },
      where: (tbl) => eq(tbl.id, input.id)
    });
    if (!result) {
      return {
        deleted: false,
        err_code: 'audio_asset_not_found' as const
      };
    }

    await deleteAssetFile(result.s3_key);
    await db.delete(audio_assets).where(eq(audio_assets.id, input.id));

    return {
      deleted: true
    };
  });

// Delete an uploaded audio file in S3 when no DB row exists (cleanup by s3_key)
const delete_uploaded_audio_file_route = protectedAdminProcedure
  .input(z.object({ s3_key: z.string() }))
  .mutation(async ({ input }) => {
    await deleteAssetFile(input.s3_key);
    return { deleted: true };
  });

const get_upload_audio_asset_url_route = protectedAdminProcedure
  .input(
    z.object({
      lang_id: z.number().int().optional().nullable(),
      text: z.string(),
      text_key: z.string()
    })
  )
  .query(async ({ input }) => {
    const s3_key =
      `audio_assets/${input.text_key}_${input.lang_id ? get_lang_from_id(input.lang_id) + '_' : ''}${crypto.randomUUID()}.webm` as const;
    const upload_url = await getAudioAssetUploadUrl(s3_key);
    return {
      upload_url,
      s3_key
    };
  });

const complete_upload_audio_asset_route = protectedAdminProcedure
  .input(
    z.object({
      lang_id: z.number().int().optional().nullable(),
      text: z.string(),
      text_key: z.string(),
      s3_key: z.string()
    })
  )
  .mutation(async ({ input }) => {
    const description = `${input.text_key} (${input.text})`;
    const [result] = await db
      .insert(audio_assets)
      .values({
        description: description,
        lang_id: input.lang_id,
        s3_key: input.s3_key,
        type: 'recorded'
      })
      .returning();

    return {
      completed: true,
      id: result.id,
      s3_key: input.s3_key,
      description: description,
      type: 'recorded' as const
    };
  });

const update_audio_asset_route = protectedAdminProcedure
  .input(
    z.object({
      id: z.number().int(),
      description: z.string(),
      lang_id: z.number().int().optional().nullable()
    })
  )
  .mutation(async ({ input: { id, description, lang_id } }) => {
    await db
      .update(audio_assets)
      .set({ description: description, lang_id: lang_id })
      .where(eq(audio_assets.id, id));
    return {
      updated: true
    };
  });

export const audio_assets_router = t.router({
  list_audio_assets: list_audio_assets_route,
  upload_audio_asset: make_upload_audio_asset_route,
  delete_audio_asset: delete_audio_asset_route,
  delete_uploaded_audio_file: delete_uploaded_audio_file_route,
  update_audio_asset: update_audio_asset_route,
  get_upload_audio_asset_url: get_upload_audio_asset_url_route,
  complete_upload_audio_asset: complete_upload_audio_asset_route
});
