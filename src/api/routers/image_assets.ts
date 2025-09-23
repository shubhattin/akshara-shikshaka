import { z } from 'zod';
import { t, protectedAdminProcedure } from '../trpc_init';
import { db } from '~/db/db';
import { image_assets } from '~/db/schema';
import { dev_delay } from '~/tools/delay';
import { getDescriptionEmbeddings } from '~/utils/ai/vector_embeddings.server';
import { sql, cosineDistance, asc, count, desc, gte, eq } from 'drizzle-orm';
import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { get_lang_from_id, get_script_from_id } from '~/state/lang_list';
import { generateImageGptImage1 } from '~/utils/ai/image.server';
import { resizeImage } from '~/utils/sharp/resize.server';
import { deleteAssetFile, uploadAssetFile } from '~/utils/s3/upload_file.server';

const list_image_assets_route = protectedAdminProcedure
  .input(
    z.object({
      search_text: z.string().optional(),
      sort_by: z.enum(['created_at', 'updated_at']).optional(),
      order_by: z.enum(['asc', 'desc']).optional().default('desc'),
      page: z.number().int().min(1),
      limit: z.number().int().min(1)
    })
  )
  .query(async ({ input }) => {
    await dev_delay(500);

    const trimmed = input.search_text?.trim();
    const embedding =
      trimmed && trimmed.length > 0
        ? await getDescriptionEmbeddings(trimmed)
        : { embeddings: [] as number[] };
    const similarity = sql<number>`1 - (${cosineDistance(image_assets.embeddings, embedding.embeddings)})`;
    const whereClause = trimmed && trimmed.length > 0 ? gte(similarity, 0.6) : undefined;

    const [{ count: totalCount }] = await db
      .select({ count: count() })
      .from(image_assets)
      .where(whereClause ?? undefined);

    const offset = (input.page - 1) * input.limit;

    const list = await db
      .select({
        id: image_assets.id,
        description: image_assets.description,
        width: image_assets.width,
        height: image_assets.height,
        s3_key: image_assets.s3_key,
        created_at: image_assets.created_at,
        updated_at: image_assets.updated_at,
        similarity
      })
      .from(image_assets)
      .where(whereClause ?? undefined)
      .orderBy((t) => {
        return [
          desc(t.similarity),
          (input.order_by === 'asc' ? asc : desc)(
            (input.sort_by ?? 'created_at') === 'updated_at'
              ? image_assets.updated_at
              : image_assets.created_at
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

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const make_upload_image_asset_route = protectedAdminProcedure
  .input(
    z.object({
      lang_id: z.number().int(),
      word_script_id: z.number().int(),
      word: z.string(),
      description: z.string()
    })
  )
  .output(
    z.discriminatedUnion('success', [
      z.object({
        success: z.literal(true),
        time_ms: z.number().int(),
        id: z.number().int(),
        s3_key: z.string()
      }),
      z.object({
        success: z.literal(false),
        err_code: z.enum(['image_upload_failed'])
      })
    ])
  )
  .mutation(async ({ input }) => {
    const { lang_id, word_script_id, word } = input;

    const start_time = Date.now();
    const lang = get_lang_from_id(lang_id);
    const word_script = get_script_from_id(word_script_id);

    const response = await generateObject({
      model: openai('gpt-4.1'),
      schema: z.object({
        image_prompt: z.string().describe('Image prompt for the word'),
        file_name: z
          .string()
          .describe(
            'A 3-4 word max file name for the image. It should not contain any spaces. Do not add any file extension. ' +
              'Words should be in lowercase, separated by underscores and no extra special characters. Eg: good_apple_image, cute_cat_image, etc. '
          )
      }),
      prompt:
        `We want to generate an image for the word "${word}" in the language ${lang}, the word provided is written in script ${word_script}. ` +
        `The image should be in picture book style, image used for illustations in books. No text should be added to the image. ` +
        `So Generate an image prompt and a file name for the provided word which we can then feed into gpt-image-1 model to generate the image.`
    });
    const { image_prompt, file_name } = response.object;
    console.log('image prompt generated');

    const s3_image_key = `image_assets/${file_name}_${crypto.randomUUID()}.webp` as const;
    const generated_image = await generateImageGptImage1(image_prompt);
    console.log('image generated');

    const IMAGE_DIMENSIONS = 256;
    const image_buffer = Buffer.from(generated_image.b64_json, 'base64');
    const resized_image_buffer = await resizeImage(
      image_buffer,
      IMAGE_DIMENSIONS,
      IMAGE_DIMENSIONS
    );
    console.log('image resized');

    try {
      await uploadAssetFile(s3_image_key, resized_image_buffer);
      console.log('image uploaded');
    } catch (e) {
      await deleteAssetFile(s3_image_key);
      return {
        success: false,
        err_code: 'image_upload_failed'
      };
    }

    const description_embeddings = await getDescriptionEmbeddings(input.description);
    const [result] = await db
      .insert(image_assets)
      .values({
        description: input.description,
        embeddings: description_embeddings.embeddings,
        embedding_model: description_embeddings.model,
        width: IMAGE_DIMENSIONS,
        height: IMAGE_DIMENSIONS,
        s3_key: s3_image_key
      })
      .returning();

    return {
      success: true,
      time_ms: Date.now() - start_time,
      id: result.id,
      s3_key: s3_image_key
    };
  });

const delete_image_asset_route = protectedAdminProcedure
  .input(z.object({ id: z.number().int() }))
  .mutation(async ({ input }) => {
    const result = await db.query.image_assets.findFirst({
      columns: {
        s3_key: true,
        id: true
      },
      where: eq(image_assets.id, input.id)
    });
    if (!result) {
      return {
        deleted: false,
        err_code: 'image_asset_not_found' as const
      };
    }

    await deleteAssetFile(result.s3_key);
    await db.delete(image_assets).where(eq(image_assets.id, input.id));

    return {
      deleted: true
    };
  });

export const image_assets_router = t.router({
  list_image_assets: list_image_assets_route,
  make_upload_image_asset: make_upload_image_asset_route,
  delete_image_asset: delete_image_asset_route
});
