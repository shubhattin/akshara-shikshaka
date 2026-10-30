/*
 * Seed for #67: the Sanskrit alphabet as lessons, with their gestures in every script that has a
 * Gesture Creator style guide.
 *
 * Run from this folder (`--prod` must come first):
 *   bun seed_sanskrit_alphabet.ts                              # local, dry run
 *   bun seed_sanskrit_alphabet.ts --apply                      # local, write
 *   bun seed_sanskrit_alphabet.ts --prod                       # prod, dry run
 *   bun seed_sanskrit_alphabet.ts --prod --apply               # prod, write (asks first)
 *   ... --apply --clear-cache                                  # also delete the stale Redis keys
 *
 * In one transaction (rolled back on a dry run), only adding or fixing the items of `ALPHABET`:
 * 0. stored keys of its lessons/gestures that differ from today's `Normal` transliteration are
 *    renamed everywhere (e.g. ज्ञ was stored as `jna`, the app now makes `jJa`),
 * 1. Sanskrit lesson categories: the missing ones are created and `ALPHABET`'s order is applied
 *    (other categories follow in their current order),
 * 2. a Sanskrit lesson for every item (no words yet), in its category and at its position;
 *    other lessons in those categories follow,
 * 3. a gesture for every item in every `FONT_SCRIPTS` script that can write it on its own
 *    (new ones have no strokes yet, for the Gesture Creator to fill),
 * 4. the item's key in its category (`gesture_text_key_lesson_category_join`) and the
 *    lesson ↔ gesture links (`lesson_gestures`), as the app does when adding lessons/gestures.
 * Gestures take the order of their lesson, so they follow `ALPHABET` in every script; other keys
 * in the category without a Sanskrit lesson (e.g. Telugu/Kannada short e, o) stay unordered.
 * Anything else (lessons or keys outside `ALPHABET`) is only reported.
 * Before writing, the touched tables are saved to `../out/seed_sanskrit_alphabet_<mode>_<time>.json`.
 */
import chalk from 'chalk';
import { eq, sql } from 'drizzle-orm';
import { writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { transliterate } from 'lipilekhika';
import { Redis } from '@upstash/redis';
import { dbClient_ext, queryClient } from '../client';
import {
  gesture_text_key_lesson_category_join,
  lesson_categories,
  lesson_gestures,
  text_gestures,
  text_lessons
} from '../../schema';
import { dbMode, make_dir, take_input } from '~/tools/kry.server';
import { lang_list_obj, script_list_obj, type script_list_type } from '~/state/lang_list';
import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE, FONT_SCRIPTS } from '~/state/font_families';

const apply = process.argv.includes('--apply');
const clearCache = process.argv.includes('--clear-cache');
const LANG_ID = lang_list_obj['Sanskrit'];
const BASE_SCRIPT = 'Devanagari' satisfies script_list_type;

/**
 * The alphabet in Devanagari, in order. Keys are not stored here: like the app, the key of a
 * text is its `Normal` transliteration.
 */
const ALPHABET = [
  { category: 'Svara', letters: 'अ आ इ ई उ ऊ ऋ ॠ ऌ ॡ ए ऐ ओ औ अं अः' },
  {
    category: 'Vyanjana',
    letters: `
      क ख ग घ ङ
      च छ ज झ ञ
      ट ठ ड ढ ण
      त थ द ध न
      प फ ब भ म
      य र ल व
      श ष स ह`
  },
  { category: 'Samyuktakshara', letters: 'क्ष त्र ज्ञ' },
  { category: 'Special Symbols', letters: 'ॐ ळ' },
  { category: 'Sankhya', letters: '० १ २ ३ ४ ५ ६ ७ ८ ९' }
];

/** The scripts offered in the app (each has fonts and a Gesture Creator style guide). */
const GESTURE_SCRIPTS: readonly script_list_type[] = FONT_SCRIPTS;
/**
 * Round-trip but are not letters of the script: Tamil has no anusvara (அம் is a + m) and Bengali
 * has no ळ (ল় is a nukta form).
 */
const SKIP_LETTERS = new Map<script_list_type, string[]>([
  ['Tamil', ['अं']],
  ['Bengali', ['ळ']]
]);

const OUT_DIR = fileURLToPath(new URL('../out/', import.meta.url));

class DryRun extends Error {}
type Tx = Parameters<Parameters<typeof dbClient_ext.transaction>[0]>[0];

const ITEMS = await Promise.all(
  ALPHABET.flatMap(({ category, letters }) =>
    letters
      .trim()
      .split(/\s+/)
      .map(async (text, i) => ({
        category,
        text,
        key: await transliterate(text, BASE_SCRIPT, 'Normal'),
        rank: i + 1
      }))
  )
);
const ITEM_KEYS = ITEMS.map((item) => item.key);

type ScriptText = { text: string } | { skip: string };

/** The item in `script`, or why it is skipped (the script can't write it on its own). */
const textInScript = async (
  { text, key }: (typeof ITEMS)[number],
  script: script_list_type
): Promise<ScriptText> => {
  if (script === BASE_SCRIPT) return { text };
  if (SKIP_LETTERS.get(script)?.includes(text)) return { skip: 'not a letter of the script' };
  const converted = await transliterate(text, BASE_SCRIPT, script);
  const back = await transliterate(converted, script, 'Normal');
  return back === key ? { text: converted } : { skip: `${converted} reads back as ${back}` };
};

const readState = async (tx: Tx) => ({
  categories: await tx.query.lesson_categories.findMany({
    where: (tbl, { eq }) => eq(tbl.lang_id, LANG_ID),
    orderBy: (tbl, { asc }) => [asc(tbl.order), asc(tbl.id)]
  }),
  lessons: await tx.query.text_lessons.findMany({
    columns: { id: true, text: true, text_key: true, category_id: true, order: true },
    where: (tbl, { eq }) => eq(tbl.lang_id, LANG_ID),
    orderBy: (tbl, { asc }) => [asc(tbl.id)]
  }),
  gestures: await tx
    .select({
      id: text_gestures.id,
      text: text_gestures.text,
      text_key: text_gestures.text_key,
      script_id: text_gestures.script_id,
      strokes: sql<number>`jsonb_array_length(${text_gestures.gestures})`.mapWith(Number)
    })
    .from(text_gestures)
    .orderBy(text_gestures.id),
  joins: await tx.query.gesture_text_key_lesson_category_join.findMany({
    where: (tbl, { eq }) => eq(tbl.lang_id, LANG_ID)
  })
});
type State = Awaited<ReturnType<typeof readState>>;

const printTable = (title: string, rows: object[]) => {
  console.log(chalk.bold(`\n${title} (${rows.length})`));
  if (rows.length > 0) console.table(rows);
};

/** Per Sanskrit category: lessons, keys, and gestures (empty ones) in each script. */
const printOverview = (title: string, state: State) => {
  const categoryOf = new Map(state.joins.map((j) => [j.gesture_text_key, j.lesson_category_id]));
  const gestureCount = (category_id: number, script: script_list_type) => {
    const gestures = state.gestures.filter(
      (g) => g.script_id === script_list_obj[script] && categoryOf.get(g.text_key) === category_id
    );
    const empty = gestures.filter((g) => g.strokes === 0).length;
    return empty > 0 ? `${gestures.length} (${empty} empty)` : `${gestures.length}`;
  };
  console.log(chalk.bold(`\n${title}`));
  console.table(
    state.categories.map((c) => ({
      id: c.id,
      name: c.name,
      order: c.order,
      lessons: state.lessons.filter((l) => l.category_id === c.id).length,
      keys: state.joins.filter((j) => j.lesson_category_id === c.id).length,
      ...Object.fromEntries(GESTURE_SCRIPTS.map((script) => [script, gestureCount(c.id, script)]))
    }))
  );
};

const writeBackup = async (state: State) => {
  await make_dir(OUT_DIR);
  const file = `${OUT_DIR}seed_sanskrit_alphabet_${dbMode.toLowerCase()}_${Date.now()}.json`;
  await writeFile(
    file,
    JSON.stringify(
      {
        lesson_categories: state.categories,
        text_lessons: state.lessons,
        text_gestures: state.gestures.map(({ id, text_key }) => ({ id, text_key })),
        gesture_text_key_lesson_category_join: state.joins
      },
      null,
      2
    )
  );
  console.log(chalk.green('\n✓ Backup written to'), file);
};

/** 0. Renames stored keys of the items that differ from their transliteration. */
const fixKeys = async (
  tx: Tx,
  state: State,
  scriptTexts: Map<script_list_type, Map<string, ScriptText>>
) => {
  const renames = new Map<string, string>();
  for (const item of ITEMS) {
    const lesson = state.lessons.find((l) => l.text === item.text);
    if (lesson && lesson.text_key !== item.key) renames.set(lesson.text_key, item.key);
    for (const script of GESTURE_SCRIPTS) {
      const result = scriptTexts.get(script)!.get(item.key)!;
      if ('skip' in result) continue;
      const gesture = state.gestures.find(
        (g) => g.script_id === script_list_obj[script] && g.text === result.text
      );
      if (gesture && gesture.text_key !== item.key) renames.set(gesture.text_key, item.key);
    }
  }

  const changes = [];
  for (const [from, to] of renames) {
    const gestures = await tx
      .update(text_gestures)
      .set({ text_key: to })
      .where(eq(text_gestures.text_key, from))
      .returning({ id: text_gestures.id });
    const lessons = await tx
      .update(text_lessons)
      .set({ text_key: to })
      .where(eq(text_lessons.text_key, from))
      .returning({ id: text_lessons.id });
    // a language where the new key already has a category keeps that one
    await tx.execute(sql`
      DELETE FROM ${gesture_text_key_lesson_category_join} AS j
      WHERE j.gesture_text_key = ${from} AND EXISTS (
        SELECT 1 FROM ${gesture_text_key_lesson_category_join} AS k
        WHERE k.gesture_text_key = ${to} AND k.lang_id = j.lang_id
      )
    `);
    await tx
      .update(gesture_text_key_lesson_category_join)
      .set({ gesture_text_key: to })
      .where(eq(gesture_text_key_lesson_category_join.gesture_text_key, from));
    changes.push({ from, to, gestures: gestures.length, lessons: lessons.length });
  }
  printTable('Key renames', changes);
};

/** 1. Returns the id of every `ALPHABET` category, creating the missing ones. */
const seedCategories = async (tx: Tx, before: State) => {
  const categoryId = new Map<string, number>();
  for (const { category } of ALPHABET) {
    const existing = before.categories.find(
      (c) => c.name.trim().toLowerCase() === category.toLowerCase()
    );
    if (existing) {
      categoryId.set(category, existing.id);
      continue;
    }
    const [row] = await tx
      .insert(lesson_categories)
      .values({ name: category, lang_id: LANG_ID, order: 0 })
      .returning({ id: lesson_categories.id });
    categoryId.set(category, row!.id);
  }

  const ids = [...categoryId.values()];
  const order = [...ids, ...before.categories.map((c) => c.id).filter((id) => !ids.includes(id))];
  const changes = [];
  for (const [i, id] of order.entries()) {
    const prev = before.categories.find((c) => c.id === id);
    if (prev?.order === i + 1) continue;
    await tx
      .update(lesson_categories)
      .set({ order: i + 1 })
      .where(eq(lesson_categories.id, id));
    const name = prev?.name ?? ALPHABET.find((c) => categoryId.get(c.category) === id)!.category;
    changes.push({ name, change: prev ? 'reordered' : 'created', from: prev?.order, to: i + 1 });
  }
  printTable('Category changes', changes);
  return categoryId;
};

/** 2. A lesson for every item, then every `ALPHABET` category is renumbered. */
const seedLessons = async (
  tx: Tx,
  before: State,
  categoryId: Map<string, number>,
  notes: string[]
) => {
  // rows are written in batches: every round trip to a remote database costs ~100-200 ms
  const changes = [];
  const newLessons: (typeof text_lessons.$inferInsert)[] = [];
  for (const item of ITEMS) {
    const category_id = categoryId.get(item.category)!;
    const lesson =
      before.lessons.find((l) => l.text === item.text) ??
      before.lessons.find((l) => l.text_key === item.key);
    if (!lesson) {
      newLessons.push({
        lang_id: LANG_ID,
        base_word_script_id: script_list_obj[BASE_SCRIPT],
        text: item.text,
        text_key: item.key,
        category_id,
        order: item.rank
      });
      changes.push({ text: item.text, key: item.key, change: 'created', category: item.category });
      continue;
    }
    if (lesson.text_key !== item.key) {
      notes.push(
        `lesson ${lesson.text} (id ${lesson.id}) has key "${lesson.text_key}", expected "${item.key}"`
      );
    }
    if (lesson.category_id !== category_id) {
      await tx.update(text_lessons).set({ category_id }).where(eq(text_lessons.id, lesson.id));
      changes.push({ text: item.text, key: item.key, change: 'moved', category: item.category });
    }
  }
  if (newLessons.length > 0) await tx.insert(text_lessons).values(newLessons);
  printTable('New or moved lessons', changes);

  // positions: the items first, then the other lessons of the category in their current order
  const orderChanges = [];
  const newOrders: { id: number; order: number }[] = [];
  const allLessons = await tx.query.text_lessons.findMany({
    columns: { id: true, text: true, order: true, category_id: true },
    where: (tbl, { eq }) => eq(tbl.lang_id, LANG_ID)
  });
  for (const { category } of ALPHABET) {
    const category_id = categoryId.get(category)!;
    const rank = new Map(ITEMS.filter((i) => i.category === category).map((i) => [i.text, i.rank]));
    const lessons = allLessons.filter((l) => l.category_id === category_id);
    lessons.sort(
      (a, b) =>
        (rank.get(a.text) ?? Infinity) - (rank.get(b.text) ?? Infinity) ||
        (a.order ?? Infinity) - (b.order ?? Infinity) ||
        a.id - b.id
    );
    for (const [i, lesson] of lessons.entries()) {
      if (!rank.has(lesson.text)) {
        notes.push(`lesson ${lesson.text} in ${category} is not in the alphabet; kept after it`);
      }
      if (lesson.order === i + 1) continue;
      newOrders.push({ id: lesson.id, order: i + 1 });
      const existed = before.lessons.some((l) => l.id === lesson.id);
      if (existed)
        orderChanges.push({ text: lesson.text, category, from: lesson.order, to: i + 1 });
    }
  }
  if (newOrders.length > 0) {
    const values = newOrders.map(({ id, order }) => sql`(${id}::int, ${order}::smallint)`);
    await tx.execute(sql`
      UPDATE ${text_lessons} AS t SET "order" = v."order", updated_at = NOW()
      FROM (VALUES ${sql.join(values, sql`, `)}) AS v(id, "order")
      WHERE t.id = v.id
    `);
  }
  printTable('Order changes of existing lessons', orderChanges);
};

/** 3. A gesture without strokes for every item missing in a script. */
const seedGestures = async (
  tx: Tx,
  before: State,
  scriptTexts: Map<script_list_type, Map<string, ScriptText>>,
  notes: string[]
) => {
  const rows = [];
  const newGestures: (typeof text_gestures.$inferInsert)[] = [];
  for (const script of GESTURE_SCRIPTS) {
    const script_id = script_list_obj[script];
    const added: string[] = [];
    const skipped: string[] = [];
    for (const item of ITEMS) {
      const result = scriptTexts.get(script)!.get(item.key)!;
      if ('skip' in result) {
        skipped.push(`${item.key} (${result.skip})`);
        continue;
      }
      const { text } = result;
      const existing = before.gestures.find((g) => g.script_id === script_id && g.text === text);
      if (existing) {
        if (existing.text_key !== item.key) {
          notes.push(
            `${script} gesture ${text} (id ${existing.id}) has key "${existing.text_key}", expected "${item.key}"`
          );
        }
        continue;
      }
      newGestures.push({
        text,
        text_key: item.key,
        script_id,
        gestures: [],
        font_family: DEFAULT_FONT_FAMILY,
        font_size: DEFAULT_FONT_SIZE,
        text_center_offset: [0, 0]
      });
      added.push(text);
    }
    rows.push({ script, added: added.length, new: added.join(' '), skipped: skipped.join(', ') });
  }
  if (newGestures.length > 0) await tx.insert(text_gestures).values(newGestures);
  console.log(chalk.bold('\nNew gestures (no strokes yet)'));
  console.table(rows);
};

/** 4. Keys into their categories and lesson ↔ gesture links. */
const linkGestures = async (tx: Tx, before: State, categoryId: Map<string, number>) => {
  const joinChanges = [];
  const joins: (typeof gesture_text_key_lesson_category_join.$inferInsert)[] = [];
  for (const item of ITEMS) {
    const lesson_category_id = categoryId.get(item.category)!;
    const prev = before.joins.find((j) => j.gesture_text_key === item.key);
    if (prev?.lesson_category_id === lesson_category_id) continue;
    joins.push({ gesture_text_key: item.key, lesson_category_id, lang_id: LANG_ID });
    joinChanges.push({ key: item.key, category: item.category, change: prev ? 'moved' : 'added' });
  }
  if (joins.length > 0) {
    await tx
      .insert(gesture_text_key_lesson_category_join)
      .values(joins)
      .onConflictDoUpdate({
        target: [
          gesture_text_key_lesson_category_join.gesture_text_key,
          gesture_text_key_lesson_category_join.lang_id
        ],
        set: { lesson_category_id: sql`excluded.lesson_category_id` }
      });
  }
  printTable('Gesture key category changes', joinChanges);

  const links = await tx.execute(sql`
    INSERT INTO ${lesson_gestures} (text_gesture_id, text_lesson_id)
    SELECT g.id, l.id
    FROM ${text_lessons} AS l
    JOIN ${text_gestures} AS g ON g.text_key = l.text_key
    WHERE l.lang_id = ${LANG_ID} AND l.text_key IN ${ITEM_KEYS}
    ON CONFLICT DO NOTHING
    RETURNING text_gesture_id
  `);
  console.log(chalk.bold(`\nLesson ↔ gesture links added: ${links.length}`));
};

const reportAfter = (after: State, categoryIds: number[], notes: string[]) => {
  const extraKeys = after.joins
    .filter(
      (j) =>
        categoryIds.includes(j.lesson_category_id) &&
        !ITEM_KEYS.includes(j.gesture_text_key) &&
        !after.lessons.some((l) => l.text_key === j.gesture_text_key)
    )
    .map((j) => j.gesture_text_key);
  if (extraKeys.length > 0) {
    notes.push(
      `keys outside the alphabet in these categories (unordered, no Sanskrit lesson): ${extraKeys.join(' ')}`
    );
  }
  const uncategorized = after.lessons.filter((l) => l.category_id === null);
  if (uncategorized.length > 0) {
    const list = uncategorized.map((l) => `${l.text} (${l.text_key})`).join(', ');
    notes.push(`uncategorized lessons (untouched): ${list}`);
  }
  if (notes.length > 0) {
    console.log(chalk.yellow.bold(`\nNotes (${notes.length})`));
    for (const note of new Set(notes)) console.log(chalk.yellow(`- ${note}`));
  }
  printOverview('After', after);
};

/** The cached category list, category lesson lists and lesson infos the seed can change. */
const staleCacheKeys = async (categoryIds: number[]) => {
  const lessons = await dbClient_ext.query.text_lessons.findMany({
    columns: { id: true },
    where: (tbl, { and, eq, inArray }) =>
      and(eq(tbl.lang_id, LANG_ID), inArray(tbl.text_key, ITEM_KEYS))
  });
  return [
    `text_lesson_category_list:${LANG_ID}`,
    ...categoryIds.map((id) => `text_lesson_category_lessons_list:${id}`),
    ...lessons.map((l) => `text_lesson_info:${l.id}`)
  ];
};

const main = async () => {
  console.log(
    chalk.bold(`Seeding the Sanskrit alphabet into the ${dbMode} database`) +
      (apply ? '' : chalk.yellow(' (dry run)'))
  );
  if (apply && dbMode !== 'LOCAL') {
    const answer = await take_input(`Write to the ${dbMode} database? (yes/no) `);
    if (!['yes', 'y'].includes(answer.trim())) return;
  }

  const scriptTexts = new Map<script_list_type, Map<string, ScriptText>>();
  for (const script of GESTURE_SCRIPTS) {
    const texts = new Map<string, ScriptText>();
    for (const item of ITEMS) texts.set(item.key, await textInScript(item, script));
    scriptTexts.set(script, texts);
  }

  let categoryIds: number[] = [];
  try {
    await dbClient_ext.transaction(async (tx) => {
      const original = await readState(tx);
      printOverview('Before', original);
      if (apply) await writeBackup(original);

      await fixKeys(tx, original, scriptTexts);
      const before = await readState(tx);

      const notes: string[] = [];
      const categoryId = await seedCategories(tx, before);
      categoryIds = [...categoryId.values()];
      await seedLessons(tx, before, categoryId, notes);
      await seedGestures(tx, before, scriptTexts, notes);
      await linkGestures(tx, before, categoryId);
      reportAfter(await readState(tx), categoryIds, notes);

      if (!apply) throw new DryRun();
    });
  } catch (e) {
    if (e instanceof DryRun) {
      console.log(chalk.yellow('\nDry run: rolled back. Re-run with --apply to write.'));
      return;
    }
    throw e;
  }
  console.log(chalk.green('\n✓ Seed applied.'));

  const cacheKeys = await staleCacheKeys(categoryIds);
  if (!clearCache) {
    console.log(
      chalk.yellow(`Stale Redis keys (re-run with --clear-cache to delete): ${cacheKeys.join(' ')}`)
    );
    return;
  }
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!
  });
  const deleted = await redis.del(...cacheKeys);
  console.log(chalk.green(`✓ Deleted ${deleted} of ${cacheKeys.length} Redis keys`));
};

main().finally(() => queryClient.end());
