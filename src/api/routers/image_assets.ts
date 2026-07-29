import { z } from 'zod';
import { t, protectedAdminProcedure, runTrpcEffect } from '../trpc_init';
import { dev_delay } from '~/tools/delay';
import {
  deleteImageAsset,
  listImageAssets,
  makeUploadImageAsset,
  updateImageAsset
} from '~/effect/workflows/image_assets';

const list_image_assets_route = protectedAdminProcedure
  .input(
    z.object({
      search_text: z.string().optional(),
      sort_by: z.enum(['created_at', 'updated_at']).optional(),
      order_by: z.enum(['asc', 'desc']).optional().prefault('desc'),
      page: z.int().min(1),
      limit: z.int().min(1)
    })
  )
  .query(async ({ input }) => {
    await dev_delay(500);
    return runTrpcEffect(listImageAssets(input));
  });

const make_upload_image_asset_route = protectedAdminProcedure
  .input(
    z.object({
      lang_id: z.int(),
      word_script_id: z.int(),
      word: z.string(),
      existing_image_prompt: z.string().optional()
    })
  )
  .output(
    z.discriminatedUnion('success', [
      z.object({
        success: z.literal(true),
        time_ms: z.int(),
        id: z.int(),
        s3_key: z.string(),
        description: z.string(),
        image_prompt: z.string()
      }),
      z.object({
        success: z.literal(false),
        err_code: z.enum(['image_upload_failed'])
      })
    ])
  )
  .mutation(async ({ input }) => runTrpcEffect(makeUploadImageAsset(input)));

const delete_image_asset_route = protectedAdminProcedure
  .input(z.object({ id: z.int() }))
  .mutation(async ({ input }) => runTrpcEffect(deleteImageAsset(input)));

const update_image_asset_route = protectedAdminProcedure
  .input(z.object({ id: z.int(), description: z.string() }))
  .mutation(async ({ input }) => runTrpcEffect(updateImageAsset(input)));

export const image_assets_router = t.router({
  list_image_assets: list_image_assets_route,
  make_upload_image_asset: make_upload_image_asset_route,
  delete_image_asset: delete_image_asset_route,
  update_image_asset: update_image_asset_route
});
