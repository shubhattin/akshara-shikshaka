import { t } from './trpc_init';
import { text_gestures_router } from './routers/text_gestures';
import { text_lessons_router } from './routers/text_lessons';
import { image_assets_router } from './routers/image_assets';
import { audio_assets_router } from './routers/audio_assets';

export const appRouter = t.router({
  text_gestures: text_gestures_router,
  text_lessons: text_lessons_router,
  image_assets: image_assets_router,
  audio_assets: audio_assets_router
});

export type AppRouter = typeof appRouter;
