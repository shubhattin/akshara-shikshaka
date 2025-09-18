CREATE TABLE "audio_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"lang_id" smallint,
	"s3_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "image_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"s3_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_gestures" (
	"text_gesture_id" integer NOT NULL,
	"text_lesson_id" integer NOT NULL,
	CONSTRAINT "lesson_gestures_text_gesture_id_text_lesson_id_pk" PRIMARY KEY("text_gesture_id","text_lesson_id")
);
--> statement-breakpoint
CREATE TABLE "text_lesson_words" (
	"id" serial PRIMARY KEY NOT NULL,
	"text_lesson_id" integer NOT NULL,
	"word" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"image_id" integer,
	"audio_id" integer
);
--> statement-breakpoint
CREATE TABLE "text_lessons" (
	"id" serial PRIMARY KEY NOT NULL,
	"lang_id" smallint NOT NULL,
	"base_word_script_id" smallint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"audio_id" integer
);
--> statement-breakpoint
ALTER TABLE "text_data" RENAME TO "text_gestures";--> statement-breakpoint
ALTER TABLE "text_gestures" DROP CONSTRAINT "text_data_text_unique";--> statement-breakpoint
ALTER TABLE "lesson_gestures" ADD CONSTRAINT "lesson_gestures_text_gesture_id_text_gestures_id_fk" FOREIGN KEY ("text_gesture_id") REFERENCES "public"."text_gestures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_gestures" ADD CONSTRAINT "lesson_gestures_text_lesson_id_text_lessons_id_fk" FOREIGN KEY ("text_lesson_id") REFERENCES "public"."text_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_lesson_words" ADD CONSTRAINT "text_lesson_words_text_lesson_id_text_lessons_id_fk" FOREIGN KEY ("text_lesson_id") REFERENCES "public"."text_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_lesson_words" ADD CONSTRAINT "text_lesson_words_image_id_image_assets_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."image_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_lesson_words" ADD CONSTRAINT "text_lesson_words_audio_id_audio_assets_id_fk" FOREIGN KEY ("audio_id") REFERENCES "public"."audio_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_lessons" ADD CONSTRAINT "text_lessons_audio_id_audio_assets_id_fk" FOREIGN KEY ("audio_id") REFERENCES "public"."audio_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_gestures" ADD CONSTRAINT "text_gestures_text_unique" UNIQUE("text");