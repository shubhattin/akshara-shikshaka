import { Effect } from 'effect';
import { protectedProcedure, t } from '~/api/trpc_init';
import { runTrpcEffect } from '~/effect/run';
import { CACHE } from '~/util/cache.server/cache_loaders';

const get_dashboard_route = protectedProcedure.query(({ ctx }) =>
  runTrpcEffect(
    Effect.gen(function* () {
      return yield* CACHE.user.dashboard.get({ userId: ctx.user.id });
    })
  )
);

export const user_stats_router = t.router({
  get_dashboard: get_dashboard_route
});
