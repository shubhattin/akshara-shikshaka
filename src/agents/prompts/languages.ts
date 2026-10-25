import {
  LANG_LIST,
  LANG_LIST_IDS,
  LANG_SCRIPT_MAP,
  SCRIPT_LIST,
  SCRIPT_LIST_IDS
} from '~/state/lang_list';

const scriptOfLang = new Map<string, string>(Object.entries(LANG_SCRIPT_MAP));
const scriptId = (script: string) => SCRIPT_LIST_IDS[SCRIPT_LIST.indexOf(script)];

/**
 * The language and script ids stored in the database (from state/lang_list/langs.json), so the
 * agent can map "Telugu gestures" or "the Hindi lessons" to the right id before querying.
 */
export function buildLanguagesContext(): string {
  const langRows = LANG_LIST.map((name, index) => {
    const script = scriptOfLang.get(name) ?? 'Normal';
    return `| ${LANG_LIST_IDS[index]} | ${name} | ${script} (${scriptId(script)}) |`;
  });
  const scriptRows = SCRIPT_LIST.map((name, index) => `| ${SCRIPT_LIST_IDS[index]} | ${name} |`);
  return `Language and script ids stored in the database. Map what the admin names to the right id before querying; never guess an id. A language and a script are different things: gestures are per script, lessons are per language.

## Languages (lang_id)
Columns: text_lessons.lang_id, lesson_categories.lang_id, audio_assets.lang_id (null = not language specific).

| lang_id | language | usual script (script_id) |
| --- | --- | --- |
${langRows.join('\n')}

## Scripts (script_id)
Columns: text_gestures.script_id, text_lessons.base_word_script_id, user_gesture_recordings.script_id.

| script_id | script |
| --- | --- |
${scriptRows.join('\n')}

- "Hindi/Marathi/Sanskrit/Nepali gestures" all mean Devanagari gestures (script_id ${scriptId('Devanagari')}); "Punjabi" is written in Gurumukhi.
- Normal = plain Latin text (English); Romanized = Latin transliteration of Indian scripts.`;
}
