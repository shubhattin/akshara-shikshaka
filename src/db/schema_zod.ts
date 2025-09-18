import { z } from 'zod';
import { createSelectSchema } from 'drizzle-zod';
import {
  text_gestures,
  text_lesson_words,
  audio_assets,
  image_assets,
  text_lessons,
  lesson_gestures
} from './schema';

export const TextGesturesSchemaZod = createSelectSchema(text_gestures, {
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export const TextLessonsSchemaZod = createSelectSchema(text_lessons, {
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export const LessonGesturesSchemaZod = createSelectSchema(lesson_gestures);

export const TextLessonWordsSchemaZod = createSelectSchema(text_lesson_words, {
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export const AudioAssetsSchemaZod = createSelectSchema(audio_assets, {
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export const ImageAssetsSchemaZod = createSelectSchema(image_assets, {
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});
