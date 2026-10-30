import dotenv from 'dotenv';
import * as schema from '../schema';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { fileURLToPath } from 'url';
import { dbMode } from '../../tools/kry.server';

// relative to this file so scripts in subfolders (`seeds/`) find it too
dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

/** `--prod` / `--preview` select the matching URL; otherwise the local URL. */
export const dbUrl = {
  LOCAL: process.env.PG_DATABASE_URL,
  PROD: process.env.PG_DATABASE_URL1,
  PREVIEW: process.env.PG_DATABASE_URL2
}[dbMode];

export const dbDataFileName = {
  PROD: 'db_data_prod.json',
  PREVIEW: 'db_data_preview.json',
  LOCAL: 'db_data.json'
}[dbMode];

if (!dbUrl) {
  throw new Error(
    `Database URL is not configured for ${dbMode} scripts (PG_DATABASE_URL / PG_DATABASE_URL1 / PG_DATABASE_URL2)`
  );
}

export const queryClient = postgres(dbUrl);
export const dbClient_ext = drizzle(queryClient, { schema });
