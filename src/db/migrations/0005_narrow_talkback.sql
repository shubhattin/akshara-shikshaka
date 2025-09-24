ALTER TABLE "audio_assets" ALTER COLUMN "description" SET DATA TYPE varchar(150);--> statement-breakpoint
ALTER TABLE "audio_assets" ALTER COLUMN "description" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "image_assets" ALTER COLUMN "description" SET DATA TYPE varchar(150);--> statement-breakpoint
ALTER TABLE "image_assets" ALTER COLUMN "description" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "image_assets" ADD COLUMN "width" smallint DEFAULT 256 NOT NULL;--> statement-breakpoint
ALTER TABLE "image_assets" ADD COLUMN "height" smallint DEFAULT 256 NOT NULL;--> statement-breakpoint
ALTER TABLE "text_lesson_words" ADD COLUMN "order" smallint NOT NULL;--> statement-breakpoint
ALTER TABLE "text_lessons" ADD COLUMN "uuid" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "text_lessons" ADD COLUMN "text" text NOT NULL;