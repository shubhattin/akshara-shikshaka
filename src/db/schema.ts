import {
  pgTable,
  text,
  timestamp,
  uuid,
  serial,
  jsonb,
  index,
  smallint
} from 'drizzle-orm/pg-core';
import type { Gesture } from '~/tools/stroke_data/types';
import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE, type FontFamily } from '~/state/font_list';

export const text_data = pgTable(
  'text_data',
  {
    id: serial().primaryKey(),
    uuid: uuid().notNull().defaultRandom(),
    text: text().notNull(),
    gestures: jsonb().$type<Gesture[]>().notNull().default([]),
    created_at: timestamp().notNull().defaultNow(),
    updated_at: timestamp()
      .notNull()
      .$onUpdate(() => new Date()),
    script_id: smallint().notNull(),
    font_family: text().notNull().default(DEFAULT_FONT_FAMILY),
    font_size: smallint().notNull().default(DEFAULT_FONT_SIZE),
    text_center_offset: jsonb().$type<[number, number]>().notNull().default([0, 0])
  },
  (table) => [index('text_data_script_text_id_idx').on(table.script_id, table.text)]
);
