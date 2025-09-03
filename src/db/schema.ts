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
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .$onUpdate(() => new Date()),
    scriptID: smallint('script_id').notNull(),
    fontFamily: text('font_family').notNull().default(DEFAULT_FONT_FAMILY),
    fontSize: smallint('font_size').notNull().default(DEFAULT_FONT_SIZE)
  },
  (table) => [index('text_data_script_text_id_idx').on(table.scriptID, table.text)]
);
