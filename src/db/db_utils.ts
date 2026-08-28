import { z } from 'zod';

export const get_db_url = (env: any): string => {
  let url: string = null!;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- runtime env check; process may be undefined in edge/browser runtimes
  if (typeof process !== 'undefined') {
    if (process.env.DB_MODE === 'PROD') url = env.PG_DATABASE_URL1;
    else if (process.env.DB_MODE === 'PREVIEW') url = env.PG_DATABASE_URL2;
    else url = env.PG_DATABASE_URL;
  } else url = env.PG_DATABASE_URL;
  const url_parse = z.string().describe('Connection string for PostgreSQL').safeParse(url);
  if (!url_parse.success) throw new Error('Please set `PG_DATABASE_URL`');
  return url_parse.data;
};
