import { t } from './trpc_init';
import { text_data_router } from './routers/text_data';

export const appRouter = t.router({
  text_data: text_data_router
});

export type AppRouter = typeof appRouter;
