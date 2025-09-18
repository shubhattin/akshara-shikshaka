import { dbClient_ext as db, queryClient } from './client';
import { writeFile } from 'fs/promises';
import { dbMode, make_dir, take_input } from '~/tools/kry.server';

export const import_data = async (confirm_env = true) => {
  if (confirm_env && !(await confirm_environemnt())) return;

  console.log(`Fetching Data from ${dbMode} Database...`);

  const text_gestures = await db.query.text_gestures.findMany();
  const text_lessons = await db.query.text_lessons.findMany();
  const lesson_gestures = await db.query.lesson_gestures.findMany();
  const text_lesson_words = await db.query.text_lesson_words.findMany();
  const audio_assets = await db.query.audio_assets.findMany();
  const image_assets = await db.query.image_assets.findMany();

  const json_data = {
    text_gestures,
    text_lessons,
    lesson_gestures,
    text_lesson_words,
    audio_assets,
    image_assets
  };

  await make_dir('./out');
  const out_file_name = {
    PROD: 'db_data_prod.json',
    PREVIEW: 'db_data_preview.json',
    LOCAL: 'db_data.json'
  }[dbMode];
  await writeFile(`./out/${out_file_name}`, JSON.stringify(json_data, null, 2));
};

if (require.main === module) {
  import_data().then(() => {
    queryClient.end();
  });
}

async function confirm_environemnt() {
  let confirmation: string = await take_input(`Are you sure SELECT from ${dbMode} ? `);
  if (['yes', 'y'].includes(confirmation)) return true;
  return false;
}
