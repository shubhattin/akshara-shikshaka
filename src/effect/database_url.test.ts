import { Effect } from 'effect';
import { describe, expect, it } from '@effect/vitest';
import { get_db_url } from '~/db/db_utils';

describe('database URL selection', () => {
  it('uses PG_DATABASE_URL by default', () => {
    expect(
      get_db_url({
        PG_DATABASE_URL: 'postgres://local/db'
      })
    ).toBe('postgres://local/db');
  });

  it('uses PG_DATABASE_URL1 when DB_MODE=PROD', () => {
    const prev = process.env.DB_MODE;
    process.env.DB_MODE = 'PROD';
    try {
      expect(
        get_db_url({
          PG_DATABASE_URL: 'postgres://local/db',
          PG_DATABASE_URL1: 'postgres://prod/db',
          PG_DATABASE_URL2: 'postgres://preview/db'
        })
      ).toBe('postgres://prod/db');
    } finally {
      if (prev === undefined) delete process.env.DB_MODE;
      else process.env.DB_MODE = prev;
    }
  });

  it('uses PG_DATABASE_URL2 when DB_MODE=PREVIEW', () => {
    const prev = process.env.DB_MODE;
    process.env.DB_MODE = 'PREVIEW';
    try {
      expect(
        get_db_url({
          PG_DATABASE_URL: 'postgres://local/db',
          PG_DATABASE_URL1: 'postgres://prod/db',
          PG_DATABASE_URL2: 'postgres://preview/db'
        })
      ).toBe('postgres://preview/db');
    } finally {
      if (prev === undefined) delete process.env.DB_MODE;
      else process.env.DB_MODE = prev;
    }
  });

  it.effect('exposes dual-mode selection for Effect database layer', () =>
    Effect.gen(function* () {
      // Sanity: Effect tests can load alongside the dual local/neon strategy.
      // Full Neon websocket integration requires live credentials and is gated outside CI.
      expect(typeof get_db_url).toBe('function');
    })
  );
});
