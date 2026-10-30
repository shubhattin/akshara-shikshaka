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
    'How to write one akṣara (text) in one script (script_id): ordered strokes in gestures. text_key = the akṣara in a script-neutral key, shared by the same akṣara across scripts and by its text_lessons. font_family/font_size/text_center_offset = how the reference glyph is drawn behind the strokes on the 400×400 canvas. Its category and order come from the lesson with its key in each language (see gesture_text_key_lesson_category_join). revision = how many times it was saved (see text_gesture_revisions). review_status = unreviewed | needs_work | approved, with review_note. agent_notes = admin notes on how to draw it.'
  ],
  [
    'gesture_text_key_lesson_category_join',
    "Groups gestures by lesson category: which lesson_categories row each text_key (its gestures in every script) belongs to. At most one category per key per language (lang_id = the category's language). Follows the category of the key's lesson in that language, or set by hand for keys with no lesson. Gesture order in a category = that lesson's text_lessons.order (keys with no lesson are unordered)"
  ],
  [
    'text_lessons',
    'A lesson for one akṣara/text in one language (lang_id); text is written in base_word_script_id. Optional audio and category; order = position inside its category'
  ],
  ['lesson_gestures', 'Lesson ↔ gesture links (lessons share the gestures of their text_key)'],
  [
    'lesson_categories',
    'Lesson and gesture groups per language (e.g. Svara, Vyanjana); sort by order'
  ],
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
  ],
  [
    'text_gesture_revisions',
    "Every saved version of a gesture: revision_no matches text_gestures.revision when it was saved (the highest is the current one). source = initial (state before history was kept) | manual (saved in the editor) | agent (a Gesture Creator proposal applied; chat_id) | revert (an older version restored; reverted_from = that revision's id)"
  ]
]);

/** Tables the agent does not need to know about. */
export const HIDDEN_TABLES = new Set([
  'agent_chats',
  'agent_messages',
  'agent_chat_gestures',
  'agent_batches',
  'agent_batch_items'
]);

/** `table.column` → type of the JSON stored in it. */
export const JSONB_COLUMN_TYPES = new Map<string, string>([
  [
    'text_gestures.gestures',
    `${zodTypeText(GestureSchema.array())} — points are raw [x, y] on a 400×400 canvas, width in canvas px, duration in ms. Never select this column to show strokes; embed a gesture preview instead`
  ],
  ['text_gestures.text_center_offset', '[dx, dy] canvas px offset of the reference glyph'],
  [
    'text_gesture_revisions.gestures',
    'Same as text_gestures.gestures, as saved in that version. Never select it to show strokes'
  ],
  ['text_gesture_revisions.text_center_offset', 'Same as text_gestures.text_center_offset']
]);
