import { z } from 'zod';
import { createSelectSchema } from 'drizzle-zod';
import {
  text_gestures,
  gesture_categories,
  lesson_categories,
  text_lesson_words,
  audio_assets,
  image_assets,
  text_lessons,
  lesson_gestures,
  gesture_text_key_category_join,
  user_gesture_recording_vectors,
  user_gesture_recordings
} from './schema';
import { GestureSchema } from '~/tools/stroke_data/types';

export const TextGesturesSchemaZod = createSelectSchema(text_gestures, {
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  gestures: GestureSchema.array(),
  text_center_offset: z.tuple([z.number(), z.number()]).prefault([0, 0])
});

export const TextLessonsSchemaZod = createSelectSchema(text_lessons, {
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export const GestureTextKeyCategoryJoinSchemaZod = createSelectSchema(
  gesture_text_key_category_join
);

export const LessonGesturesSchemaZod = createSelectSchema(lesson_gestures);

export const TextLessonWordsSchemaZod = createSelectSchema(text_lesson_words, {
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export const LessonCategoriesSchemaZod = createSelectSchema(lesson_categories, {
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export const GestureCategoriesSchemaZod = createSelectSchema(gesture_categories, {
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

export const UserGestureRecordingsSchemaZod = createSelectSchema(user_gesture_recordings, {
  created_at: z.coerce.date()
});

export const UserGestureRecordingVectorsSchemaZod = createSelectSchema(
  user_gesture_recording_vectors
);
