import { pgTable, text, timestamp, uuid, varchar, bigint, serial } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const text_data = pgTable('text_data', {
  id: serial('id').primaryKey(),
  uuid: uuid('uuid').notNull().defaultRandom(),
  text: text('text').notNull(),
  svg: text('svg').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .$onUpdate(() => new Date())
});
