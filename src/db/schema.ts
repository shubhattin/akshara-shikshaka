import { pgTable, text, timestamp, uuid, serial, jsonb, index } from 'drizzle-orm/pg-core';
import type { Gesture } from '~/tools/stroke_data/types';

export const text_data = pgTable(
  'text_data',
  {
    id: serial('id').primaryKey(),
    uuid: uuid('uuid').notNull().defaultRandom(),
    text: text('text').notNull(),
    gestures: jsonb('gestures').$type<Gesture[]>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .$onUpdate(() => new Date())
  },
  (table) => [index('text_data_text_idx').on(table.text)]
);
