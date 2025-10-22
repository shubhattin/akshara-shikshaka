import { relations } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  uuid,
  serial,
  jsonb,
  index,
  smallint,
  integer,
  primaryKey,
  unique,
  varchar,
  pgEnum,
  foreignKey
} from 'drizzle-orm/pg-core';
import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE, type FontFamily } from '~/state/font_list';
import type { Gesture } from '~/tools/stroke_data/types';

export const text_gestures = pgTable(
  'text_gestures',
  {
    id: serial().primaryKey(),
    uuid: uuid().notNull().defaultRandom(),
    text: text().notNull(),
    text_key: text().notNull(),
    // for searching across multiple scripts for the same akshara
    gestures: jsonb().$type<Gesture[]>().notNull().default([]),
    created_at: timestamp().notNull().defaultNow(),
    updated_at: timestamp()
      .notNull()
      .$onUpdate(() => new Date()),
    script_id: smallint().notNull(),
    font_family: text().notNull().default(DEFAULT_FONT_FAMILY).$type<FontFamily>(),
    font_size: smallint().notNull().default(DEFAULT_FONT_SIZE),
    text_center_offset: jsonb().$type<[number, number]>().notNull().default([0, 0]),
    order: smallint()
    // order is "nullable" for text lessons
    // and should be handled accordingly in the UI and backend
  },
  (table) => [
    index('text_gestures_script_text_id_idx').on(table.script_id, table.text),
    index('text_gestures_text_key_idx').on(table.text_key),
    unique('text_gestures_text_key_script_id_unique').on(table.text_key, table.script_id)
  ]
);

export const gesture_text_key_category_join = pgTable(
  'gesture_text_key_category_join',
  {
    id: serial().primaryKey(),
    gesture_text_key: text().notNull(),
    category_id: integer().notNull()
  },
  (table) => [
    unique('gesture_text_key_category_join_unique').on(table.gesture_text_key, table.category_id),
    foreignKey({
      name: 'text_key_category_id_fk',
      columns: [table.category_id],
      foreignColumns: [gesture_categories.id]
    }).onDelete('cascade')
  ]
);

// gesture categories are not specific to a script
// rather they have 12M relation with gestures via the join table
export const gesture_categories = pgTable('gesture_categories', {
  id: serial().primaryKey(),
  name: text().notNull(),
  order: smallint().notNull(),
  created_at: timestamp().notNull().defaultNow(),
  updated_at: timestamp()
    .notNull()
    .$onUpdate(() => new Date())
});

export const text_lessons = pgTable('text_lessons', {
  id: serial().primaryKey(),
  uuid: uuid().notNull().defaultRandom(),
  lang_id: smallint().notNull(),
  base_word_script_id: smallint().notNull(),
  // ^ script in which the words are stored, used for transliteration
  // it is the script used for writing those words
  text: text().notNull(),
  // ^ will be in the base_word_script_id script
  text_key: text().notNull(),
  created_at: timestamp().notNull().defaultNow(),
  updated_at: timestamp()
    .notNull()
    .$onUpdate(() => new Date()),
  audio_id: integer().references(() => audio_assets.id, { onDelete: 'set null' }),
  // optional audio for the lesson, eg :- when no words for the "text",
  category_id: integer().references(() => lesson_categories.id, { onDelete: 'set null' }),
  order: smallint()
  // order is "nullable" for text lessons
  // and should be handled accordingly in the UI and backend
});

// A text lesson will have multiple gestures connected to it. But as other text lessons can alsp access the same gestures
// So we need to join table for the M2M relationship between text_gestures and text_lessons

// for many-to-many relationship between text_gestures and text_lessons
export const lesson_gestures = pgTable(
  'lesson_gestures',
  {
    text_gesture_id: integer()
      .notNull()
      .references(() => text_gestures.id, { onDelete: 'cascade' }),
    text_lesson_id: integer()
      .notNull()
      .references(() => text_lessons.id, { onDelete: 'cascade' })
  },
  (table) => [primaryKey({ columns: [table.text_gesture_id, table.text_lesson_id] })]
);

export const lesson_categories = pgTable('lesson_categories', {
  id: serial().primaryKey(),
  name: text().notNull(),
  lang_id: smallint().notNull(),
  order: smallint().notNull(), // order is not nullable for lesson categories
  created_at: timestamp().notNull().defaultNow(),
  updated_at: timestamp()
    .notNull()
    .$onUpdate(() => new Date())
});

export const text_lesson_words = pgTable('text_lesson_words', {
  id: serial().primaryKey(),
  text_lesson_id: integer()
    .notNull()
    .references(() => text_lessons.id, { onDelete: 'cascade' }),
  // ^ auto delete on text lessons deletion
  word: text().notNull(),
  order: smallint().notNull(),
  created_at: timestamp().notNull().defaultNow(),
  updated_at: timestamp()
    .notNull()
    .$onUpdate(() => new Date()),
  image_id: integer().references(() => image_assets.id, { onDelete: 'set null' }),
  audio_id: integer().references(() => audio_assets.id, { onDelete: 'set null' })
});

export const image_assets = pgTable('image_assets', {
  id: serial().primaryKey(),
  description: varchar('description', { length: 150 }).notNull().default(''),
  width: smallint().notNull().default(256),
  height: smallint().notNull().default(256),
  s3_key: text().notNull(),
  created_at: timestamp().notNull().defaultNow(),
  updated_at: timestamp()
    .notNull()
    .$onUpdate(() => new Date())
});

export const image_asset_type_enum = pgEnum('image_asset_type_enum', ['ai_generated', 'recorded']);
export const audio_assets = pgTable(
  'audio_assets',
  {
    id: serial().primaryKey(),
    description: varchar('description', { length: 150 }).notNull().default(''),
    lang_id: smallint(), // optional language id for the audio like for words and pronunciation specific to a language
    s3_key: text().notNull(),
    type: image_asset_type_enum().notNull().default('ai_generated'),
    created_at: timestamp().notNull().defaultNow(),
    updated_at: timestamp()
      .notNull()
      .$onUpdate(() => new Date())
  },
  (table) => [index('audio_assets_type_idx').on(table.type)]
);

// relations

export const lesssonGesturesRelations = relations(lesson_gestures, ({ one }) => ({
  text_gesture: one(text_gestures, {
    fields: [lesson_gestures.text_gesture_id],
    references: [text_gestures.id]
  }),
  text_lesson: one(text_lessons, {
    fields: [lesson_gestures.text_lesson_id],
    references: [text_lessons.id]
  })
}));

export const gestureCategoriesRelations = relations(gesture_categories, ({ many }) => ({
  gestures: many(text_gestures)
}));

export const gestureTextKeyCategoryJoinRelations = relations(
  gesture_text_key_category_join,
  ({ one }) => ({
    category: one(gesture_categories, {
      fields: [gesture_text_key_category_join.category_id],
      references: [gesture_categories.id]
    })
  })
);

export const textGesturesRelations = relations(text_gestures, ({ many, one }) => ({
  lessons: many(lesson_gestures) // via join table
}));

export const lessonCategoriesRelations = relations(lesson_categories, ({ many }) => ({
  lessons: many(text_lessons)
}));

export const textLessonsRelations = relations(text_lessons, ({ many, one }) => ({
  gestures: many(lesson_gestures), // via join table
  words: many(text_lesson_words),
  optional_audio: one(audio_assets, {
    fields: [text_lessons.audio_id],
    references: [audio_assets.id]
  }),
  category: one(lesson_categories, {
    fields: [text_lessons.category_id],
    references: [lesson_categories.id]
  })
}));

export const textLessonWordsRelations = relations(text_lesson_words, ({ one }) => ({
  image: one(image_assets, {
    fields: [text_lesson_words.image_id],
    references: [image_assets.id]
  }),
  audio: one(audio_assets, {
    fields: [text_lesson_words.audio_id],
    references: [audio_assets.id]
  }),
  lesson: one(text_lessons, {
    fields: [text_lesson_words.text_lesson_id],
    references: [text_lessons.id]
  })
}));

export const imageAssetsRelations = relations(image_assets, ({ many }) => ({
  words: many(text_lesson_words)
}));

export const audioAssetsRelations = relations(audio_assets, ({ many }) => ({
  words: many(text_lesson_words),
  optional_lessons: many(text_lessons)
}));
