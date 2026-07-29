import { Effect } from 'effect';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { lesson_gestures, text_lesson_words, text_lessons } from '~/db/schema';
import { dbRun, dbTransaction, type DbTransaction } from '~/effect/database';
import { BadRequestError, NotFoundError } from '~/effect/errors';
import { CACHE } from '~/effect/cache';
import { BackgroundWork } from '~/effect/background';
import { appRuntime } from '~/effect/runtime';
import { reorder_text_lesson_in_category } from './lesson_categories';

const connect_gestures_to_text_lessons = async (
  textKey: string,
  text_lesson_id: number,
  dbConn: DbTransaction
) => {
  const gestures = await dbConn.query.text_gestures.findMany({
    columns: { id: true },
    where: (tbl, { eq }) => eq(tbl.text_key, textKey)
  });
  if (gestures.length === 0) return;
  await dbConn.insert(lesson_gestures).values(
    gestures.map((gesture) => ({
      text_gesture_id: gesture.id,
      text_lesson_id
    }))
  );
};

export const addTextLesson = Effect.fn('addTextLesson')(function* (input: {
  lesson_info: {
    lang_id: number;
    base_word_script_id: number;
    audio_id: number | null;
    text: string;
  };
  text_key: string;
  words: Array<{
    word: string;
    order: number;
    image_id: number | null;
    audio_id: number | null;
  }>;
}) {
  const background = yield* BackgroundWork;
  const { lang_id, base_word_script_id, audio_id, text } = input.lesson_info;
  const text_key = input.text_key.trim();

  const outcome = yield* dbTransaction('add_text_lesson', async (tx) => {
    const existing_lesson = await tx.query.text_lessons.findFirst({
      where: (tbl, { and, eq }) => and(eq(tbl.text, text), eq(tbl.lang_id, lang_id)),
      columns: { id: true }
    });
    if (existing_lesson) {
      return { ok: false as const, reason: 'already_exists' as const };
    }

    const [inserted] = await tx
      .insert(text_lessons)
      .values({ lang_id, base_word_script_id, audio_id, text, text_key })
      .returning();

    const addedWords =
      input.words.length > 0
        ? await tx
            .insert(text_lesson_words)
            .values(
              input.words.map((word) => ({
                ...word,
                text_lesson_id: inserted.id
              }))
            )
            .returning()
        : [];

    await connect_gestures_to_text_lessons(text_key, inserted.id, tx);

    return {
      ok: true as const,
      result: inserted,
      added_word_ids: addedWords.map((w) => w.id)
    };
  });

  if (!outcome.ok) {
    return yield* Effect.fail(BadRequestError.make({ message: 'Text lesson already exists' }));
  }

  yield* background.enqueue(() =>
    appRuntime.runPromise(CACHE.lessons.text_lesson_info.refresh({ lesson_id: outcome.result.id }))
  );

  return {
    id: outcome.result.id,
    uuid: outcome.result.uuid,
    added_word_ids: outcome.added_word_ids,
    success: true as const
  };
});

export const updateTextLesson = Effect.fn('updateTextLesson')(function* (input: {
  lesson_info: { id: number; audio_id: number | null; uuid: string };
  words: Array<{
    id?: number;
    word: string;
    order: number;
    image_id: number | null;
    audio_id: number | null;
  }>;
}) {
  const background = yield* BackgroundWork;
  const { id, audio_id, uuid } = input.lesson_info;

  const outcome = yield* dbTransaction('update_text_lesson', async (tx) => {
    const res = await tx
      .update(text_lessons)
      .set({ audio_id })
      .where(and(eq(text_lessons.id, id), eq(text_lessons.uuid, uuid)))
      .returning();
    if (res.length === 0) {
      return { ok: false as const, reason: 'not_found' as const };
    }

    const existing_word_ids = (
      await tx.query.text_lesson_words.findMany({
        where: (tbl, { eq }) => eq(tbl.text_lesson_id, id)
      })
    ).map((word) => word.id);

    const to_update_words = input.words.filter(
      (word): word is (typeof input.words)[number] & { id: number } =>
        word.id !== undefined && word.id !== null && existing_word_ids.includes(word.id)
    );
    const to_add_words = input.words.filter((word) => word.id === undefined || word.id === null);
    const to_delete_word_ids = existing_word_ids.filter(
      (word_id) => !input.words.some((word) => word.id === word_id)
    );

    if (to_delete_word_ids.length > 0) {
      await tx
        .delete(text_lesson_words)
        .where(
          and(
            inArray(text_lesson_words.id, to_delete_word_ids),
            eq(text_lesson_words.text_lesson_id, id)
          )
        );
    }

    const inserted =
      to_add_words.length > 0
        ? await tx
            .insert(text_lesson_words)
            .values(to_add_words.map((word) => ({ ...word, text_lesson_id: id })))
            .returning()
        : [];

    if (to_update_words.length > 0) {
      await tx.execute(sql`
        UPDATE ${text_lesson_words} AS t
        SET
          word = v.word,
          "order" = v."order",
          image_id = v.image_id,
          audio_id = v.audio_id,
          updated_at = NOW()
        FROM (VALUES ${sql.join(
          to_update_words.map(
            (word) =>
              sql`(${word.id}::int, ${word.word}::text, ${word.order}::smallint, ${word.image_id}::int, ${word.audio_id}::int)`
          ),
          sql`, `
        )}) AS v(id, word, "order", image_id, audio_id)
        WHERE t.id = v.id
          AND t.text_lesson_id = ${id}
      `);
    }

    return { ok: true as const, inserted };
  });

  if (!outcome.ok) {
    return yield* Effect.fail(
      NotFoundError.make({ resource: 'text_lesson', message: 'Text lesson not found' })
    );
  }

  yield* background.enqueue(() =>
    appRuntime.runPromise(CACHE.lessons.text_lesson_info.refresh({ lesson_id: id }))
  );
  yield* CACHE.lessons.text_lesson_info.delete({ lesson_id: id });

  return {
    updated: true as const,
    inserted_words_ids: outcome.inserted.map((word) => word.id)
  };
});

export const deleteTextLesson = Effect.fn('deleteTextLesson')(function* (input: {
  id: number;
  uuid: string;
}) {
  const background = yield* BackgroundWork;
  const { id, uuid } = input;

  const outcome = yield* dbTransaction('delete_text_lesson', async (tx) => {
    const text_lesson_ = await tx.query.text_lessons.findFirst({
      columns: { id: true, category_id: true },
      where: and(eq(text_lessons.id, id), eq(text_lessons.uuid, uuid))
    });
    if (!text_lesson_) {
      return { ok: false as const };
    }

    await tx.delete(text_lessons).where(and(eq(text_lessons.id, id), eq(text_lessons.uuid, uuid)));
    if (text_lesson_.category_id) {
      await reorder_text_lesson_in_category(text_lesson_.category_id, id, tx);
    }
    return { ok: true as const, category_id: text_lesson_.category_id };
  });

  if (!outcome.ok) {
    return yield* Effect.fail(
      NotFoundError.make({ resource: 'text_lesson', message: 'Text lesson not found' })
    );
  }

  if (outcome.category_id) {
    const category_id = outcome.category_id;
    yield* background.enqueue(() =>
      appRuntime.runPromise(CACHE.lessons.category_lesson_list.refresh({ category_id }))
    );
  }
  yield* CACHE.lessons.text_lesson_info.delete({ lesson_id: id });

  return { deleted: true as const };
});

export const getTextLessonWordMediaData = Effect.fn('getTextLessonWordMediaData')(
  function* (input: { word_id: number; lesson_id: number }) {
    return yield* dbRun('get_text_lesson_word_media_data', async (db) => {
      const word = await db.query.text_lesson_words.findFirst({
        where: (tbl, { eq }) =>
          and(eq(tbl.id, input.word_id), eq(tbl.text_lesson_id, input.lesson_id)),
        columns: { id: true },
        with: {
          image: {
            columns: {
              id: true,
              description: true,
              s3_key: true,
              height: true,
              width: true
            }
          },
          audio: {
            columns: {
              id: true,
              description: true,
              s3_key: true
            }
          }
        }
      });
      return {
        image_asset: word?.image,
        audio_asset: word?.audio
      };
    });
  }
);

export const getTextLessonOptionalAudioData = Effect.fn('getTextLessonOptionalAudioData')(
  function* (input: { lesson_id: number }) {
    return yield* dbRun('get_text_lesson_optional_audio_data', async (db) => {
      const lesson = await db.query.text_lessons.findFirst({
        where: (tbl, { eq }) => eq(tbl.id, input.lesson_id),
        columns: { id: true },
        with: {
          optional_audio: {
            columns: {
              id: true,
              description: true,
              s3_key: true
            }
          }
        }
      });
      return {
        audio_asset: lesson?.optional_audio ?? null
      };
    });
  }
);

export const getTextLessonInfo = Effect.fn('getTextLessonInfo')(function* (input: {
  lesson_id: number;
}) {
  return yield* CACHE.lessons.text_lesson_info.get({ lesson_id: input.lesson_id });
});
