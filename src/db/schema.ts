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
    scriptID: smallint('script_id').notNull()
  },
  (table) => [index('text_data_script_text_id_idx').on(table.scriptID, table.text)]
);
