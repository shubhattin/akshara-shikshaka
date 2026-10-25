import { GestureSchema } from '~/tools/stroke_data/types';
import { zodTypeText } from './zod_type_text';

/**
 * Meaning the DDL cannot carry. `describe_schema.test.ts` fails when a table in
 * `src/db/schema.ts` has neither a note here nor an entry in `HIDDEN_TABLES` — add one with
 * every new table.
 */
export const TABLE_NOTES = new Map<string, string>([
  [
    'text_gestures',
    'How to write one akṣara (text) in one script (script_id): ordered strokes in gestures. text_key = the akṣara in a script-neutral key, shared by the same akṣara across scripts and by its text_lessons. font_family/font_size/text_center_offset = how the reference glyph is drawn behind the strokes on the 400×400 canvas. order = position inside its gesture category.'
  ],
  [
    'gesture_categories',
    'Groups of akṣaras for practice (e.g. vowels, consonants), shared by all scripts; sort by order'
  ],
  [
    'gesture_text_key_category_join',
    'Which category each text_key belongs to (one category per key)'
  ],
  [
    'text_lessons',
    'A lesson for one akṣara/text in one language (lang_id); text is written in base_word_script_id. Optional audio and category; order = position inside its category'
  ],
  ['lesson_gestures', 'Lesson ↔ gesture links (lessons share the gestures of their text_key)'],
  ['lesson_categories', 'Lesson groups per language; sort by order'],
  [
    'text_lesson_words',
    'Example words of a lesson, ordered by order, with optional picture and pronunciation audio'
  ],
  ['image_assets', 'Pictures (mostly AI generated) for lesson words; s3_key in the CDN bucket'],
  [
    'audio_assets',
    'Pronunciation audio (AI generated or recorded) for words and lessons; s3_key in the CDN bucket'
  ],
  [
    'user_gesture_recordings',
    'One practice attempt: a learner writing text in script_id. completed = finished every stroke. user_id = Better Auth user id, null for guests'
  ],
  [
    'user_gesture_recording_vectors',
    'Per-stroke result of a practice attempt: index = stroke index, recorded_accuracy 0–1, recorded/drawn vectors are the compared feature vectors (not drawable points)'
  ]
]);

/** Tables the agent does not need to know about. */
export const HIDDEN_TABLES = new Set(['agent_chats', 'agent_messages']);

/** `table.column` → type of the JSON stored in it. */
export const JSONB_COLUMN_TYPES = new Map<string, string>([
  [
    'text_gestures.gestures',
    `${zodTypeText(GestureSchema.array())} — points are raw [x, y] on a 400×400 canvas, width in canvas px, duration in ms. Never select this column to show strokes; embed a gesture preview instead`
  ],
  ['text_gestures.text_center_offset', '[dx, dy] canvas px offset of the reference glyph']
]);
