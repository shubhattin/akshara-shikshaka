import { t } from './trpc_init';
import { text_gestures_router } from './routers/text_gestures';
import { text_lessons_router } from './routers/text_lessons';

export const appRouter = t.router({
  text_gestures: text_gestures_router,
  text_lessons: text_lessons_router
});

export type AppRouter = typeof appRouter;
