import { db } from '~/db/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { gesture_categories, gesture_text_key_category_join, text_gestures } from '~/db/schema';

/** Decode dynamic segment like Next `[id]` (optional suffix after `:`). */
export function parseEncodedNumericId(raw: string): number {
  const [idStr] = decodeURIComponent(raw).split(':');
  return z.coerce.number().int().parse(idStr);
}

export async function loadTextLessonForEdit(id: number) {
  return db.query.text_lessons.findFirst({
    where: (tbl, { eq: e }) => e(tbl.id, id),
    columns: {
      id: true,
      uuid: true,
      lang_id: true,
      text: true,
      text_key: true,
      base_word_script_id: true,
      order: true,
      category_id: true,
      audio_id: true
    },
    orderBy: (tbl, { asc }) => [asc(tbl.text)],
    with: {
      category: {
        columns: {
          id: true,
          name: true
        }
      },
      gestures: {
        columns: {
          text_gesture_id: true
        },
        with: {
          text_gesture: {
            columns: {
              id: true,
              text: true,
              script_id: true
            }
          }
        }
      },
      words: {
        columns: {
          id: true,
          word: true,
          image_id: true,
          audio_id: true,
          order: true
        },
        orderBy: (tbl, { asc }) => [asc(tbl.order)]
      }
    }
  });
}

export async function loadAudioAssetForEdit(id: number) {
  return db.query.audio_assets.findFirst({
    where: (table, { eq: e }) => e(table.id, id),
    columns: {
      id: true,
      description: true,
      s3_key: true,
      type: true,
      lang_id: true,
      created_at: true,
      updated_at: true
    },
    with: {
      words: {
        columns: {
          id: true,
          word: true,
          text_lesson_id: true,
          order: true
        },
        with: {
          lesson: {
            columns: {
              text: true
            }
          }
        },
        orderBy: (tbl, { asc }) => [asc(tbl.text_lesson_id), asc(tbl.order)]
      }
    }
  });
}

export async function loadImageAssetForEdit(id: number) {
  return db.query.image_assets.findFirst({
    where: (table, { eq: e }) => e(table.id, id),
    columns: {
      id: true,
      description: true,
      s3_key: true,
      height: true,
      width: true,
      created_at: true,
      updated_at: true
    },
    with: {
      words: {
        columns: {
          id: true,
          word: true,
          text_lesson_id: true,
          order: true
        },
        with: {
          lesson: {
            columns: {
              text: true
            }
          }
        },
        orderBy: (tbl, { asc }) => [asc(tbl.text_lesson_id), asc(tbl.order)]
      }
    }
  });
}

export async function loadTextGestureForEdit(id: number) {
  const [row] = await db
    .select()
    .from(text_gestures)
    .leftJoin(
      gesture_text_key_category_join,
      eq(text_gestures.text_key, gesture_text_key_category_join.gesture_text_key)
    )
    .leftJoin(
      gesture_categories,
      eq(gesture_text_key_category_join.category_id, gesture_categories.id)
    )
    .where(eq(text_gestures.id, id))
    .limit(1);

  if (!row?.text_gestures) return null;

  return {
    ...row.text_gestures,
    category: row.gesture_categories
      ? {
          name: row.gesture_categories.name,
          id: row.gesture_categories.id
        }
      : null
  };
}
