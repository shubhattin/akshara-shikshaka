ALTER TABLE "text_lesson_words" ADD COLUMN "order" smallint NOT NULL;--> statement-breakpoint
ALTER TABLE "text_lessons" ADD COLUMN "uuid" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "text_lessons" ADD COLUMN "text" text NOT NULL;