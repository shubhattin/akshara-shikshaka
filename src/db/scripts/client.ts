import dotenv from 'dotenv';
import * as schema from '../schema';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { dbMode } from '../../tools/kry.server';

dotenv.config({ path: '../../../.env' });

const DB_URL = {
  LOCAL: import.meta.env.PG_DATABASE_URL!,
  PROD: import.meta.env.PG_DATABASE_URL1!,
  PREVIEW: import.meta.env.PG_DATABASE_URL2!
}[dbMode];

export const queryClient = postgres(DB_URL!);
export const dbClient_ext = drizzle(queryClient, { schema });
