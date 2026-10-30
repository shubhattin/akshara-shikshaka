-- Gestures take the order of their key's lesson, so first make every key with a lesson sit in the
-- lesson's category (the app keeps it that way from now on):
-- a categorized lesson puts its key's gestures in its category,
INSERT INTO "gesture_text_key_lesson_category_join" ("gesture_text_key", "lesson_category_id", "lang_id")
SELECT DISTINCT ON ("text_key", "lang_id") "text_key", "category_id", "lang_id"
FROM "text_lessons"
WHERE "category_id" IS NOT NULL
ORDER BY "text_key", "lang_id", "id"
ON CONFLICT ("gesture_text_key", "lang_id")
DO UPDATE SET "lesson_category_id" = excluded."lesson_category_id";--> statement-breakpoint
-- and an uncategorized lesson joins the category its gestures already sit in (unordered).
UPDATE "text_lessons" AS l
SET "category_id" = j."lesson_category_id", "order" = NULL, "updated_at" = NOW()
FROM "gesture_text_key_lesson_category_join" AS j
WHERE l."category_id" IS NULL
  AND j."gesture_text_key" = l."text_key"
  AND j."lang_id" = l."lang_id";--> statement-breakpoint
ALTER TABLE "text_gestures" DROP COLUMN "order";
