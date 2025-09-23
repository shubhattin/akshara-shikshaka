import { z } from 'zod';
import { t, protectedAdminProcedure } from '../trpc_init';
import { db } from '~/db/db';
import { image_assets } from '~/db/schema';
import { count, ilike } from 'drizzle-orm';
import { dev_delay } from '~/tools/delay';

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
    const whereClause =
      trimmed && trimmed.length > 0 ? ilike(image_assets.description, `%${trimmed}%`) : undefined;

    const [{ count: totalCount }] = await db
      .select({ count: count() })
      .from(image_assets)
      .where(whereClause ?? undefined);

    const offset = (input.page - 1) * input.limit;

    const list = await db.query.image_assets.findMany({
      ...(whereClause ? { where: () => whereClause } : {}),
      orderBy: (image_assets, { asc, desc }) => [
        (input.order_by === 'asc' ? asc : desc)(
          (input.sort_by ?? 'created_at') === 'updated_at'
            ? image_assets.updated_at
            : image_assets.created_at
        )
      ],
      limit: input.limit,
      offset,
      columns: {
        id: true,
        description: true,
        width: true,
        height: true,
        s3_key: true,
        created_at: true,
        updated_at: true
      }
    });

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

export const image_assets_router = t.router({
  list_image_assets: list_image_assets_route
});
