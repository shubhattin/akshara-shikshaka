/*
 * One-off patch for #65: gestures stop having their own categories and use the lesson categories.
 *
 * Run from this folder BEFORE applying migration 0017 (which drops the old tables):
 *   bun patch_gesture_lesson_categories.ts                    # local, dry run
 *   bun patch_gesture_lesson_categories.ts --apply            # local, write
 *   bun patch_gesture_lesson_categories.ts --prod             # prod, dry run
 *   bun patch_gesture_lesson_categories.ts --prod --apply     # prod, write (asks first)
 *
 * If the old tables were already dropped, add `--from-dump` to read the old gesture categories
 * from the JSON dump written by `import_data.ts` (`out/db_data.json` / `out/db_data_prod.json`).
 *
 * In one transaction:
 * 1. creates `gesture_text_key_lesson_category_join` (the non-DROP statements of migration 0017),
 * 2. maps every gesture category to the Sanskrit lesson category of the same name, creating the
 *    missing ones after the existing ones,
 * 3. puts क्ष त्र ज्ञ (kSha, tra, jna) in a new "Samyuktakshara" category, in that order,
 * 4. adds the keys of categorized lessons that have no category yet,
 * 5. fixes `text_gestures.order`: orders below 1 take the position of the same key in Devanagari,
 *    gestures without a category lose their order, and every category is renumbered 1..n per
 *    script.
 * Before writing, the old tables and the old orders are saved to
 * `out/patch_gesture_lesson_categories_<mode>_<time>.json`.
 */
import chalk from 'chalk';
import { sql } from 'drizzle-orm';
import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { dbClient_ext, dbDataFileName, queryClient } from './client';
import { dbMode, make_dir, take_input } from '~/tools/kry.server';
import { lang_list_obj, script_list_obj } from '~/state/lang_list';

const apply = process.argv.includes('--apply');
const fromDump = process.argv.includes('--from-dump');
const LANG_ID = lang_list_obj['Sanskrit'];
const DEVANAGARI_ID = script_list_obj['Devanagari'];
const SAMYUKTAKSHARA = { name: 'Samyuktakshara', keys: ['kSha', 'tra', 'jna'] };

const OUT_DIR = fileURLToPath(new URL('./out/', import.meta.url));
const MIGRATION_FILE = fileURLToPath(
  new URL('../migrations/0017_gesture_lesson_categories.sql', import.meta.url)
);

class DryRun extends Error {}

const OldCategoriesSchema = z.object({
  gesture_categories: z.array(z.object({ id: z.int(), name: z.string(), order: z.int() })),
  gesture_text_key_category_join: z.array(
    z.object({ gesture_text_key: z.string(), category_id: z.int() })
  )
});
const OrderRowSchema = z.object({ id: z.int(), order: z.int().nullable() });

const main = async () => {
  console.log(chalk.bold(`Patching ${dbMode} database${apply ? '' : chalk.yellow(' (dry run)')}`));
  if (apply && dbMode !== 'LOCAL') {
    const answer = await take_input(`Write to the ${dbMode} database? (yes/no) `);
    if (!['yes', 'y'].includes(answer.trim())) return;
  }

  try {
    await dbClient_ext.transaction(async (tx) => {
      const rows = async <S extends z.ZodType>(schema: S, query: ReturnType<typeof sql>) =>
        z.array(schema).parse(Array.from(await tx.execute(query)));

      const [old] = await rows(
        z.object({ cats: z.string().nullable(), join: z.string().nullable() }),
        sql`
        SELECT to_regclass('public.gesture_categories')::text AS cats,
               to_regclass('public.gesture_text_key_category_join')::text AS join
      `
      );
      const oldTablesExist = Boolean(old?.cats && old.join);
      if (!oldTablesExist && !fromDump) {
        throw new Error(
          'The old gesture category tables are gone (migration 0017 already applied?); re-run with --from-dump'
        );
      }

      // 1. new table (quiet the "already exists, skipping" notices)
      await tx.execute(sql`SET LOCAL client_min_messages = warning`);
      const migration = await readFile(MIGRATION_FILE, 'utf8');
      for (const statement of migration.split('--> statement-breakpoint')) {
        if (/DROP TABLE/i.test(statement)) continue;
        await tx.execute(sql.raw(statement));
      }

      const { gesture_categories: gestureCategories, gesture_text_key_category_join: oldJoin } =
        OldCategoriesSchema.parse(
          oldTablesExist
            ? {
                gesture_categories: Array.from(
                  await tx.execute(
                    sql`SELECT id, name, "order" FROM gesture_categories ORDER BY "order"`
                  )
                ),
                gesture_text_key_category_join: Array.from(
                  await tx.execute(
                    sql`SELECT gesture_text_key, category_id FROM gesture_text_key_category_join`
                  )
                )
              }
            : JSON.parse(await readFile(`${OUT_DIR}${dbDataFileName}`, 'utf8'))
        );
      if (!oldTablesExist) {
        console.log(chalk.yellow(`Old gesture categories read from out/${dbDataFileName}`));
        gestureCategories.sort((a, b) => a.order - b.order);
      }
      const before = await rows(
        OrderRowSchema.extend({ script_id: z.int(), text: z.string(), text_key: z.string() }),
        sql`SELECT id, script_id, text, text_key, "order" FROM text_gestures ORDER BY id`
      );
      const lessonCategoriesBefore = Array.from(
        await tx.execute(sql`SELECT * FROM lesson_categories ORDER BY id`)
      );

      if (apply) {
        await make_dir(OUT_DIR);
        const file = `${OUT_DIR}patch_gesture_lesson_categories_${dbMode.toLowerCase()}_${Date.now()}.json`;
        await writeFile(
          file,
          JSON.stringify(
            {
              gesture_categories: gestureCategories,
              gesture_text_key_category_join: oldJoin,
              lesson_categories: lessonCategoriesBefore,
              text_gesture_orders: before.map(({ id, order }) => ({ id, order }))
            },
            null,
            2
          )
        );
        console.log(chalk.green('✓ Backup written to'), file);
      }

      // 2 & 3. lesson categories for every gesture category, then Samyuktakshara
      const ensureCategory = async (name: string) => {
        const [existing] = await rows(
          z.object({ id: z.int() }),
          sql`
          SELECT id FROM lesson_categories
          WHERE lang_id = ${LANG_ID} AND lower(trim(name)) = lower(trim(${name}))
          ORDER BY "order" LIMIT 1
        `
        );
        if (existing) return existing.id;
        const [created] = await rows(
          z.object({ id: z.int(), order: z.int() }),
          sql`
          INSERT INTO lesson_categories (name, lang_id, "order", updated_at)
          VALUES (
            ${name}, ${LANG_ID},
            (SELECT COALESCE(MAX("order"), 0) + 1 FROM lesson_categories WHERE lang_id = ${LANG_ID}),
            NOW()
          )
          RETURNING id, "order"
        `
        );
        console.log(
          chalk.cyan(`+ lesson category "${name}" (id ${created!.id}, order ${created!.order})`)
        );
        return created!.id;
      };

      const categoryFor = new Map<number, number>();
      for (const category of gestureCategories) {
        categoryFor.set(category.id, await ensureCategory(category.name));
      }
      const samyuktaksharaId = await ensureCategory(SAMYUKTAKSHARA.name);

      const join = async (text_key: string, lesson_category_id: number) => {
        await tx.execute(sql`
          INSERT INTO gesture_text_key_lesson_category_join (gesture_text_key, lesson_category_id, lang_id)
          VALUES (${text_key}, ${lesson_category_id}, ${LANG_ID})
          ON CONFLICT (gesture_text_key, lang_id) DO NOTHING
        `);
      };
      for (const row of oldJoin)
        await join(row.gesture_text_key, categoryFor.get(row.category_id)!);
      for (const key of SAMYUKTAKSHARA.keys) await join(key, samyuktaksharaId);

      // 4. keys of categorized lessons (any language) that have no category in that language
      await tx.execute(sql`
        INSERT INTO gesture_text_key_lesson_category_join (gesture_text_key, lesson_category_id, lang_id)
        SELECT DISTINCT ON (l.text_key, l.lang_id) l.text_key, l.category_id, l.lang_id
        FROM text_lessons AS l
        WHERE l.category_id IS NOT NULL
        ORDER BY l.text_key, l.lang_id, l.id
        ON CONFLICT (gesture_text_key, lang_id) DO NOTHING
      `);

      // 5. orders
      const samyuktaRank = sql.join(
        SAMYUKTAKSHARA.keys.map((key, i) => sql`(${key}::text, ${i + 1}::int)`),
        sql`, `
      );
      await tx.execute(sql`
        UPDATE text_gestures AS t SET "order" = v.rank, updated_at = NOW()
        FROM (VALUES ${samyuktaRank}) AS v(text_key, rank)
        WHERE t.text_key = v.text_key
      `);
      await tx.execute(sql`
        UPDATE text_gestures AS t SET "order" = NULL, updated_at = NOW()
        WHERE t."order" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM gesture_text_key_lesson_category_join AS j
            WHERE j.gesture_text_key = t.text_key
          )
      `);
      // invalid orders sort where the same key sits in Devanagari, then renumber per script
      await tx.execute(sql`
        UPDATE text_gestures AS t SET "order" = r.new_order, updated_at = NOW()
        FROM (
          SELECT g.id,
            ROW_NUMBER() OVER (
              PARTITION BY j.lesson_category_id, g.script_id
              ORDER BY CASE WHEN g."order" >= 1 THEN g."order" ELSE COALESCE(d."order", 0) END,
                       COALESCE(d."order", 0), g.id
            ) AS new_order
          FROM text_gestures AS g
          JOIN gesture_text_key_lesson_category_join AS j
            ON j.gesture_text_key = g.text_key AND j.lang_id = ${LANG_ID}
          LEFT JOIN text_gestures AS d
            ON d.text_key = g.text_key AND d.script_id = ${DEVANAGARI_ID} AND d."order" >= 1
          WHERE g."order" IS NOT NULL
        ) AS r
        WHERE t.id = r.id AND t."order" IS DISTINCT FROM r.new_order
      `);

      // report
      const summary = Array.from(
        await tx.execute(sql`
        SELECT c.id, c.name, c."order", count(DISTINCT j.gesture_text_key)::int AS keys,
               count(g.id)::int AS gestures, count(g."order")::int AS ordered
        FROM lesson_categories AS c
        LEFT JOIN gesture_text_key_lesson_category_join AS j ON j.lesson_category_id = c.id
        LEFT JOIN text_gestures AS g ON g.text_key = j.gesture_text_key
        WHERE c.lang_id = ${LANG_ID}
        GROUP BY c.id ORDER BY c."order"
      `)
      );
      console.log(chalk.bold('\nSanskrit lesson categories after the patch'));
      console.table(summary);

      const after = new Map(
        (await rows(OrderRowSchema, sql`SELECT id, "order" FROM text_gestures`)).map((row) => [
          row.id,
          row.order
        ])
      );
      const changed = before
        .filter((row) => after.get(row.id) !== row.order)
        .map((row) => ({
          id: row.id,
          script_id: row.script_id,
          text: row.text,
          text_key: row.text_key,
          from: row.order,
          to: after.get(row.id)
        }));
      console.log(chalk.bold(`\nOrder changes (${changed.length})`));
      if (changed.length > 0) console.table(changed);

      const uncategorized = Array.from(
        await tx.execute(sql`
        SELECT g.text_key, string_agg(g.text, ' ' ORDER BY g.script_id) AS texts
        FROM text_gestures AS g
        WHERE NOT EXISTS (
          SELECT 1 FROM gesture_text_key_lesson_category_join AS j
          WHERE j.gesture_text_key = g.text_key AND j.lang_id = ${LANG_ID}
        )
        GROUP BY g.text_key ORDER BY g.text_key
      `)
      );
      console.log(chalk.bold(`\nStill uncategorized in Sanskrit (${uncategorized.length})`));
      if (uncategorized.length > 0) console.table(uncategorized);

      if (!apply) throw new DryRun();
    });
    console.log(chalk.green('\n✓ Patch applied. Now apply migration 0017 to drop the old tables.'));
  } catch (e) {
    if (e instanceof DryRun) {
      console.log(chalk.yellow('\nDry run: rolled back. Re-run with --apply to write.'));
    } else {
      throw e;
    }
  }
};

main().finally(() => queryClient.end());
