CREATE TABLE "gesture_text_key_category_join" (
	"id" serial PRIMARY KEY NOT NULL,
	"gesture_text_key" text NOT NULL,
	"category_id" integer NOT NULL,
	CONSTRAINT "gesture_text_key_category_join_unique" UNIQUE("gesture_text_key","category_id")
);
--> statement-breakpoint
ALTER TABLE "text_gestures" DROP CONSTRAINT "text_gestures_category_id_gesture_categories_id_fk";
--> statement-breakpoint
ALTER TABLE "gesture_text_key_category_join" ADD CONSTRAINT "gesture_text_key_category_join_category_id_gesture_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."gesture_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gesture_categories" DROP COLUMN "script_id";--> statement-breakpoint
ALTER TABLE "text_gestures" DROP COLUMN "category_id";