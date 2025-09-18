import { t, protectedAdminProcedure } from '../trpc_init';
import { z } from 'zod';
import { lesson_gestures, text_lesson_words, text_lessons } from '~/db/schema';
import { db } from '~/db/db';
import { and, eq, inArray } from 'drizzle-orm';
import { TextLessonsSchemaZod, TextLessonWordsSchemaZod } from '~/db/schema_zod';

/**
 * Only for adding text lessons and not for adding words related\
 * Along with the text gestures data associated with it
 */
const add_text_lesson_route = protectedAdminProcedure
  .input(
    z.object({
      lesson_info: TextLessonsSchemaZod.pick({
        lang_id: true,
        base_word_script_id: true,
        audio_id: true
      }),
      gesture_ids: z.array(z.number().int())
    })
  )
  .output(
    z.object({
      id: z.number().int()
    })
  )
  .mutation(
    async ({
      input: {
        lesson_info: { lang_id, base_word_script_id, audio_id },
        gesture_ids: gestures_ids
      }
    }) => {
      const result = await db
        .insert(text_lessons)
        .values({ lang_id, base_word_script_id, audio_id })
        .returning();

      // insert values in the join table
      await db.insert(lesson_gestures).values(
        gestures_ids.map((gesture_id) => ({
          text_lesson_id: result[0].id,
          text_gesture_id: gesture_id
        }))
      );

      return {
        id: result[0].id
      };
    }
  );

const update_text_lesson_route = protectedAdminProcedure
  .input(
    z.object({
      lesson_info: TextLessonsSchemaZod.pick({
        id: true,
        lang_id: true,
        base_word_script_id: true,
        audio_id: true
      }),
      gesture_ids: z.array(z.number().int())
    })
  )
  .mutation(
    async ({
      input: {
        lesson_info: { id, lang_id, base_word_script_id, audio_id },
        gesture_ids
      }
    }) => {
      // updating text lessons
      await db
        .update(text_lessons)
        .set({ lang_id, base_word_script_id, audio_id })
        .where(eq(text_lessons.id, id));

      // updating lesson gestures
      const existing_gesture_ids = (
        await db.query.lesson_gestures.findMany({
          where: eq(lesson_gestures.text_lesson_id, id)
        })
      ).map((gesture) => gesture.text_gesture_id);

      const to_add_gesture_ids = gesture_ids.filter(
        (gesture_id) => !existing_gesture_ids.includes(gesture_id)
      );
      const deleted_gesture_ids = existing_gesture_ids.filter(
        (gesture_id) => !gesture_ids.includes(gesture_id)
      );

      await Promise.allSettled([
        db
          .delete(lesson_gestures)
          .where(
            and(
              inArray(lesson_gestures.text_gesture_id, deleted_gesture_ids),
              eq(lesson_gestures.text_lesson_id, id)
            )
          ),
        db.insert(lesson_gestures).values(
          to_add_gesture_ids.map((gesture_id) => ({
            text_lesson_id: id,
            text_gesture_id: gesture_id
          }))
        )
      ]);

      return {
        updated: true
      };
    }
  );

const delete_text_lesson_route = protectedAdminProcedure
  .input(z.object({ id: z.number().int() }))
  .mutation(async ({ input: { id } }) => {
    await db.delete(text_lessons).where(eq(text_lessons.id, id));

    // the words and lesson gestures will be deleted automatically due to the cascade delete constraint

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
  .output(
    z.object({
      added: z.number().int(),
      ids: z.array(z.number().int())
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
  .output(
    z.object({
      deleted: z.number().int(),
      updated: z.number().int()
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
  update_text_lesson: update_text_lesson_route,
  delete_text_lesson: delete_text_lesson_route,
  add_lesson_words: add_lesson_words_route,
  update_lesson_words: update_lesson_words_route
});
