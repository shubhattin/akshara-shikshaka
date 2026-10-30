import { z } from 'zod';
import { createSelectSchema } from 'drizzle-zod';
import {
  text_gestures,
  lesson_categories,
  text_lesson_words,
  audio_assets,
  image_assets,
  text_lessons,
  lesson_gestures,
  gesture_text_key_lesson_category_join,
  user_gesture_recording_vectors,
  user_gesture_recordings,
  agent_chats,
  agent_messages
} from './schema';
import { GestureSchema } from '~/tools/stroke_data/types';
import { agent_model_id_schema } from '~/agents/models';
import { agent_kind_schema } from '~/agents/agent_kinds';

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

export const GestureTextKeyLessonCategoryJoinSchemaZod = createSelectSchema(
  gesture_text_key_lesson_category_join
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

export const AgentChatsSchemaZod = createSelectSchema(agent_chats, {
  model: agent_model_id_schema,
  agent_kind: agent_kind_schema,
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  stop_requested_at: z.coerce.date().optional().nullable()
});

export const AgentMessagesSchemaZod = createSelectSchema(agent_messages, {
  role: z.enum(['system', 'user', 'assistant']),
  created_at: z.coerce.date()
});
