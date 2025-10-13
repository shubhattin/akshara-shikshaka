CREATE TABLE "gesture_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"script_id" smallint NOT NULL,
	"order" smallint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"lang_id" smallint NOT NULL,
	"order" smallint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "text_gestures" ADD COLUMN "category_id" integer;--> statement-breakpoint
ALTER TABLE "text_gestures" ADD COLUMN "order" smallint;--> statement-breakpoint
ALTER TABLE "text_lessons" ADD COLUMN "category_id" integer;--> statement-breakpoint
ALTER TABLE "text_lessons" ADD COLUMN "order" smallint;--> statement-breakpoint
ALTER TABLE "text_gestures" ADD CONSTRAINT "text_gestures_category_id_gesture_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."gesture_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_lessons" ADD CONSTRAINT "text_lessons_category_id_lesson_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."lesson_categories"("id") ON DELETE set null ON UPDATE no action;