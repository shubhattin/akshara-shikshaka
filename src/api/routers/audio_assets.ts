import { z } from 'zod';
import { t, protectedAdminProcedure } from '../trpc_init';
import { dev_delay } from '~/tools/delay';
import { and, asc, count, desc, eq, ilike } from 'drizzle-orm';
import { db } from '~/db/db';
import { audio_assets } from '~/db/schema';
import { generateGpt4oMiniTtsSpeech, VoiceTypeEnum } from '~/utils/ai/text_to_speech.server';
import { uploadAssetFile, deleteAssetFile } from '~/utils/s3/upload_file.server';
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
      if (input.lang_id) {
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

    const audioBuffer = await generateGpt4oMiniTtsSpeech({
      text: input.text,
      instructions:
        `Speak in a cheerful and friendly tone. Slowly and clearly. The accent of speech should be Indian. ` +
        `The Text is in ${input.voice_language} language. The word is ${input.text} (${input.text_key}).`,
      voice: input.voice
    });
    console.log('audio generated');

    const s3_key =
      `audio_assets/${input.text_key}_${input.lang_id ? get_lang_from_id(input.lang_id) + '_' : '' + crypto.randomUUID()}.webm` as const;
    await uploadAssetFile(s3_key, audioBuffer.fileBuffer);
    console.log('audio uploaded');

    const description = `${input.text_key} (${input.text}`;
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
      description
    };
  });

export const audio_assets_router = t.router({
  list_audio_assets: list_audio_assets_route,
  upload_audio_asset: make_upload_audio_asset_route
});
