import { describe, expect, it } from 'vitest';
import { guardSelectQuery } from './sql_guard';

const verdicts = (queries: string[]) =>
  Object.fromEntries(queries.map((query) => [query, guardSelectQuery(query).ok]));
const all = (queries: string[], ok: boolean) =>
  Object.fromEntries(queries.map((query) => [query, ok]));

describe('guardSelectQuery', () => {
  it('allows plain reads', () => {
    const queries = [
      'SELECT text, text_key FROM text_gestures ORDER BY id',
      "select * from text_lessons where updated_at > now() - interval '7 days';",
      `WITH counts AS (SELECT text_lesson_id, count(*) n FROM text_lesson_words GROUP BY 1)
      SELECT p.text, counts.n FROM counts JOIN text_lessons p ON p.id = counts.text_lesson_id ORDER BY 2 DESC LIMIT 10`,
      'SELECT jsonb_array_length(gestures) FROM text_gestures OFFSET 5'
    ];
    expect(verdicts(queries)).toEqual(all(queries, true));
  });

  it('ignores keywords inside strings, quoted identifiers and comments', () => {
    const queries = [
      "SELECT title FROM text_lessons WHERE title ILIKE '%delete; drop table%'",
      'SELECT 1 AS "update" -- insert into x\n',
      "SELECT 'it''s; fine' AS note"
    ];
    expect(verdicts(queries)).toEqual(all(queries, true));
  });

  it('does not trip on identifiers that contain blocked words', () => {
    const queries = [
      'SELECT updated_at, created_at FROM text_lessons',
      "SELECT format('%s lines', count(*)) FROM text_gestures"
    ];
    expect(verdicts(queries)).toEqual(all(queries, true));
  });

  it('blocks writes, DDL and multiple statements', () => {
    const queries = [
      'DELETE FROM text_gestures',
      'UPDATE text_gestures SET listed = true',
      'SELECT 1; DROP TABLE text_gestures',
      'WITH d AS (DELETE FROM text_gestures RETURNING *) SELECT * FROM d',
      'SELECT * INTO new_table FROM text_gestures',
      'SELECT * FROM text_gestures FOR UPDATE',
      'SELECT * FROM text_gestures FOR SHARE',
      'SELECT * FROM text_gestures FOR KEY SHARE',
      'CREATE TABLE x (id int)',
      'EXPLAIN ANALYZE SELECT 1'
    ];
    expect(verdicts(queries)).toEqual(all(queries, false));
  });

  it('blocks side-effect functions and session changes', () => {
    const queries = [
      'SELECT pg_sleep(10)',
      "SELECT set_config('statement_timeout', '0', false)",
      "SELECT nextval('text_gestures_id_seq')",
      "SELECT pg_read_file('/etc/passwd')",
      "SELECT * FROM dblink('host=x', 'select 1') AS t(a int)"
    ];
    expect(verdicts(queries)).toEqual(all(queries, false));
  });

  it('rejects dollar quoting and unterminated input', () => {
    const queries = ['SELECT $$ delete $$', "SELECT 'open", 'SELECT 1 /* never closed'];
    expect(verdicts(queries)).toEqual(all(queries, false));
  });
});
