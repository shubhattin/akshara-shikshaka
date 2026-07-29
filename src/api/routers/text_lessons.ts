import { t, protectedAdminProcedure, publicProcedure, runTrpcEffect } from '../trpc_init';
import { z } from 'zod';
import { TextLessonsSchemaZod, TextLessonWordsSchemaZod } from '~/db/schema_zod';
import {
  addTextLesson,
  deleteTextLesson,
  getTextLessonInfo,
  getTextLessonOptionalAudioData,
  getTextLessonWordMediaData,
  updateTextLesson
} from '~/effect/workflows/text_lessons';
import { lesson_categories_router } from './lesson_categories';

const add_text_lesson_route = protectedAdminProcedure
  .input(
    z.object({
      lesson_info: TextLessonsSchemaZod.pick({
        lang_id: true,
        base_word_script_id: true,
        audio_id: true,
        text: true
      }).extend({
        text: z.string().min(1)
      }),
      text_key: z.string().min(1),
      words: TextLessonWordsSchemaZod.omit({
        id: true,
        created_at: true,
        updated_at: true,
        text_lesson_id: true
      }).array()
    })
  )
  .output(
    z.object({
      id: z.int(),
      uuid: z.uuid(),
      added_word_ids: z.array(z.int())
    })
  )
  .mutation(async ({ input }) => runTrpcEffect(addTextLesson(input)));

const update_text_lesson_route = protectedAdminProcedure
  .input(
    z.object({
      lesson_info: TextLessonsSchemaZod.pick({
        id: true,
        audio_id: true,
        uuid: true
      }),
      words: TextLessonWordsSchemaZod.omit({
        created_at: true,
        updated_at: true,
        text_lesson_id: true
      })
        .extend({
          id: z.int().optional()
        })
        .array()
    })
  )
  .mutation(async ({ input }) => runTrpcEffect(updateTextLesson(input)));

const delete_text_lesson_route = protectedAdminProcedure
  .input(z.object({ id: z.int(), uuid: z.uuid() }))
  .mutation(async ({ input }) => runTrpcEffect(deleteTextLesson(input)));

const get_text_lesson_word_media_data_route = protectedAdminProcedure
  .input(z.object({ word_id: z.int(), lesson_id: z.int() }))
  .query(async ({ input }) => runTrpcEffect(getTextLessonWordMediaData(input)));

const get_text_lesson_optional_audio_data_route = protectedAdminProcedure
  .input(z.object({ lesson_id: z.int() }))
  .query(async ({ input }) => runTrpcEffect(getTextLessonOptionalAudioData(input)));

const get_text_lesson_info_route = publicProcedure
  .input(z.object({ lesson_id: z.int() }))
  .query(async ({ input }) => runTrpcEffect(getTextLessonInfo(input)));

export const text_lessons_router = t.router({
  add_text_lesson: add_text_lesson_route,
  update_text_lesson: update_text_lesson_route,
  delete_text_lesson: delete_text_lesson_route,
  get_text_lesson_word_media_data: get_text_lesson_word_media_data_route,
  get_text_lesson_optional_audio_data: get_text_lesson_optional_audio_data_route,
  categories: lesson_categories_router,
  get_text_lesson_info: get_text_lesson_info_route
});
