import { t, protectedAdminProcedure } from '../trpc_init';
import { z } from 'zod';
import { text_lesson_words, text_lessons } from '~/db/schema';
import { db } from '~/db/db';
import { eq, inArray } from 'drizzle-orm';
import { TextLessonsSchemaZod, TextLessonWordsSchemaZod } from '~/db/schema_zod';

/**
 * Only for adding text lessons and not for adding words related
 */
const add_text_lesson_route = protectedAdminProcedure
  .input(
    TextLessonsSchemaZod.pick({
      lang_id: true,
      base_word_script_id: true,
      audio_id: true
    })
  )
  .mutation(async ({ input: { lang_id, base_word_script_id, audio_id } }) => {
    const result = await db
      .insert(text_lessons)
      .values({ lang_id, base_word_script_id, audio_id })
      .returning();
    return {
      id: result[0].id
    };
  });

const delete_text_lesson_route = protectedAdminProcedure
  .input(z.object({ id: z.number().int() }))
  .mutation(async ({ input: { id } }) => {
    await db.delete(text_lessons).where(eq(text_lessons.id, id));
    return {
      deleted: true
    };
  });

const add_lesson_words_route = protectedAdminProcedure
  .input(
    z.object({
      text_lesson_id: z.number().int(),
      words: TextLessonWordsSchemaZod.omit({
        id: true,
        created_at: true,
        updated_at: true
      }).array()
    })
  )
  .mutation(async ({ input: { text_lesson_id, words } }) => {
    const result = await db
      .insert(text_lesson_words)
      .values(
        words.map((word) => {
          return {
            ...word,
            text_lesson_id
          };
        })
      )
      .returning();
    return {
      added: result.length,
      ids: result.map((word) => word.id)
    };
  });

const update_lesson_words_route = protectedAdminProcedure
  .input(
    z.object({
      to_delete_words_ids: z.array(z.number().int()),
      to_update_words: TextLessonWordsSchemaZod.omit({
        created_at: true,
        updated_at: true
      }).array()
    })
  )
  .mutation(async ({ input: { to_delete_words_ids, to_update_words } }) => {
    await db.delete(text_lesson_words).where(inArray(text_lesson_words.id, to_delete_words_ids));
    const result = await Promise.allSettled([
      ...to_update_words.map((word) =>
        db.update(text_lesson_words).set(word).where(eq(text_lesson_words.id, word.id))
      )
    ]);
    return {
      deleted: to_delete_words_ids.length,
      updated: result.filter((r) => r.status === 'fulfilled').length
    };
  });

export const text_lessons_router = t.router({
  add_text_lesson: add_text_lesson_route,
  delete_text_lesson: delete_text_lesson_route,
  add_lesson_words: add_lesson_words_route,
  update_lesson_words: update_lesson_words_route
});
