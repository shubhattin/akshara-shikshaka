import { dbClient_ext as db, queryClient } from './client';
import { readFile } from 'fs/promises';
import { dbMode, take_input } from '~/tools/kry.server';
import {
  audio_assets,
  gesture_categories,
  gesture_text_key_category_join,
  image_assets,
  lesson_categories,
  lesson_gestures,
  text_gestures,
  text_lesson_words,
  text_lessons
} from '~/db/schema';
import {
  AudioAssetsSchemaZod,
  ImageAssetsSchemaZod,
  LessonGesturesSchemaZod,
  TextGesturesSchemaZod,
  TextLessonsSchemaZod,
  TextLessonWordsSchemaZod,
  GestureCategoriesSchemaZod,
  GestureTextKeyCategoryJoinSchemaZod,
  LessonCategoriesSchemaZod
} from '~/db/schema_zod';
import { z } from 'zod';
import { InferInsertModel, sql } from 'drizzle-orm';
import chalk from 'chalk';

const main = async () => {
  /*
   Better backup & restore tools like `pg_dump` and `pg_restore` should be used.
  
   Although Here the foriegn key relations are not that complex so we are doing it manually
  */
  if (!(await confirm_environemnt())) return;

  console.log(`Insering Data into ${dbMode} Database...`);

  const in_file_name = {
    PROD: 'db_data_prod.json',
    PREVIEW: 'db_data_preview.json',
    LOCAL: 'db_data.json'
  }[dbMode];

  const data = z
    .object({
      gesture_categories: GestureCategoriesSchemaZod.array(),
      text_gestures: TextGesturesSchemaZod.array(),
      gesture_text_key_category_join: GestureTextKeyCategoryJoinSchemaZod.array(),
      lesson_categories: LessonCategoriesSchemaZod.array(),
      text_lessons: TextLessonsSchemaZod.array(),
      lesson_gestures: LessonGesturesSchemaZod.array(),
      text_lesson_words: TextLessonWordsSchemaZod.array(),
      audio_assets: AudioAssetsSchemaZod.array(),
      image_assets: ImageAssetsSchemaZod.array()
    })
    .parse(JSON.parse((await readFile(`./out/${in_file_name}`)).toString()));

  // deleting all the tables initially
  try {
    await db.delete(text_gestures);
    await db.delete(text_lessons);
    await db.delete(gesture_text_key_category_join);
    await db.delete(gesture_categories);
    await db.delete(lesson_categories);
    await db.delete(lesson_gestures);
    await db.delete(text_lesson_words);
    await db.delete(audio_assets);
    await db.delete(image_assets);
    console.log(chalk.green('✓ Deleted All Tables Successfully'));
  } catch (e) {
    console.log(chalk.red('✗ Error while deleting tables:'), chalk.yellow(e));
  }

  // inserting audio assets
  try {
    await db.insert(audio_assets).values(data.audio_assets);
    console.log(
      chalk.green('✓ Successfully added values into table'),
      chalk.blue('`audio_assets`')
    );
  } catch (e) {
    console.log(chalk.red('✗ Error while inserting audio assets:'), chalk.yellow(e));
  }

  // inserting image assets
  try {
    await db.insert(image_assets).values(data.image_assets);
    console.log(
      chalk.green('✓ Successfully added values into table'),
      chalk.blue('`image_assets`')
    );
  } catch (e) {
    console.log(chalk.red('✗ Error while inserting image assets:'), chalk.yellow(e));
  }

  // inserting gesture categories
  try {
    await db.insert(gesture_categories).values(data.gesture_categories);
    console.log(
      chalk.green('✓ Successfully added values into table'),
      chalk.blue('`gesture_categories`')
    );
  } catch (e) {
    console.log(chalk.red('✗ Error while inserting gesture categories:'), chalk.yellow(e));
  }

  // inserting text gestures
  try {
    await db
      .insert(text_gestures)
      .values(data.text_gestures as InferInsertModel<typeof text_gestures>[]);
    console.log(
      chalk.green('✓ Successfully added values into table'),
      chalk.blue('`text_gestures`')
    );
  } catch (e) {
    console.log(chalk.red('✗ Error while inserting word_puzzles:'), chalk.yellow(e));
  }

  // inserting gesture text key category join
  try {
    await db.insert(gesture_text_key_category_join).values(data.gesture_text_key_category_join);
    console.log(
      chalk.green('✓ Successfully added values into table'),
      chalk.blue('`gesture_text_key_category_join`')
    );
  } catch (e) {
    console.log(
      chalk.red('✗ Error while inserting gesture text key category join:'),
      chalk.yellow(e)
    );
  }

  // inserting lesson categories
  try {
    await db.insert(lesson_categories).values(data.lesson_categories);
    console.log(
      chalk.green('✓ Successfully added values into table'),
      chalk.blue('`lesson_categories`')
    );
  } catch (e) {
    console.log(chalk.red('✗ Error while inserting lesson categories:'), chalk.yellow(e));
  }

  // inserting text lessons
  try {
    await db.insert(text_lessons).values(data.text_lessons);
    console.log(
      chalk.green('✓ Successfully added values into table'),
      chalk.blue('`text_lessons`')
    );
  } catch (e) {
    console.log(chalk.red('✗ Error while inserting text lessons:'), chalk.yellow(e));
  }

  // inserting lesson gestures
  try {
    await db.insert(lesson_gestures).values(data.lesson_gestures);
    console.log(
      chalk.green('✓ Successfully added values into table'),
      chalk.blue('`lesson_gestures`')
    );
  } catch (e) {
    console.log(chalk.red('✗ Error while inserting lesson gestures:'), chalk.yellow(e));
  }

  // inserting text lesson words
  try {
    await db.insert(text_lesson_words).values(data.text_lesson_words);
    console.log(
      chalk.green('✓ Successfully added values into table'),
      chalk.blue('`text_lesson_words`')
    );
  } catch (e) {
    console.log(chalk.red('✗ Error while inserting text lesson words:'), chalk.yellow(e));
  }

  // resetting SERIAL
  try {
    await db.execute(
      sql`SELECT setval('"text_gestures_id_seq"', (select MAX(id) from "text_gestures"))`
    );
    await db.execute(
      sql`SELECT setval('"gesture_categories_id_seq"', (select MAX(id) from "gesture_categories"))`
    );
    await db.execute(
      sql`SELECT setval('"lesson_categories_id_seq"', (select MAX(id) from "lesson_categories"))`
    );
    await db.execute(
      sql`SELECT setval('"gesture_text_key_category_join_id_seq"', (select MAX(id) from "gesture_text_key_category_join"))`
    );
    await db.execute(
      sql`SELECT setval('"text_lessons_id_seq"', (select MAX(id) from "text_lessons"))`
    );
    await db.execute(
      sql`SELECT setval('"text_lesson_words_id_seq"', (select MAX(id) from "text_lesson_words"))`
    );
    await db.execute(
      sql`SELECT setval('"audio_assets_id_seq"', (select MAX(id) from "audio_assets"))`
    );
    await db.execute(
      sql`SELECT setval('"image_assets_id_seq"', (select MAX(id) from "image_assets"))`
    );
    console.log(chalk.green('✓ Successfully resetted ALL SERIAL'));
  } catch (e) {
    console.log(chalk.red('✗ Error while resetting SERIAL:'), chalk.yellow(e));
  }
};
main().then(() => {
  queryClient.end();
});

async function confirm_environemnt() {
  let confirmation: string = await take_input(`Are you sure INSERT in ${dbMode} ? `);
  if (['yes', 'y'].includes(confirmation)) return true;
  return false;
}
