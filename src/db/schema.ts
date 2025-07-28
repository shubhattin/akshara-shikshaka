import {
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  bigint,
  serial,
  jsonb
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const text_data = pgTable('text_data', {
  id: serial('id').primaryKey(),
  uuid: uuid('uuid').notNull().defaultRandom(),
  text: text('text').notNull(),
  svg_json: jsonb('svg_json').notNull().$type<any>(),
  strokes_json: jsonb('strokes_json').$type<any>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .$onUpdate(() => new Date())
});
