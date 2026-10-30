-- Idempotent on purpose: `src/db/scripts/patch_gesture_lesson_categories.ts` runs the non-DROP
-- statements below first, moves the old gesture categories over, and then this migration only
-- drops the old tables.
CREATE TABLE IF NOT EXISTS "gesture_text_key_lesson_category_join" (
	"id" serial PRIMARY KEY NOT NULL,
	"gesture_text_key" text NOT NULL,
	"lesson_category_id" integer NOT NULL,
	"lang_id" smallint NOT NULL,
	CONSTRAINT "gesture_text_key_lesson_category_join_key_lang_unique" UNIQUE("gesture_text_key","lang_id")
);
--> statement-breakpoint
DROP TABLE IF EXISTS "gesture_categories" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "gesture_text_key_category_join" CASCADE;--> statement-breakpoint
ALTER TABLE "gesture_text_key_lesson_category_join" DROP CONSTRAINT IF EXISTS "gesture_text_key_lesson_category_join_lesson_category_id_lesson_categories_id_fk";--> statement-breakpoint
ALTER TABLE "gesture_text_key_lesson_category_join" ADD CONSTRAINT "gesture_text_key_lesson_category_join_lesson_category_id_lesson_categories_id_fk" FOREIGN KEY ("lesson_category_id") REFERENCES "public"."lesson_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gesture_text_key_lesson_category_join_category_idx" ON "gesture_text_key_lesson_category_join" USING btree ("lesson_category_id");
