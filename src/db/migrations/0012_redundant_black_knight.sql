ALTER TABLE "text_gestures" DROP CONSTRAINT "text_gestures_text_key_script_id_unique";--> statement-breakpoint
DROP INDEX "text_gestures_script_text_id_idx";--> statement-breakpoint
CREATE INDEX "text_lessons_text_key_idx" ON "text_lessons" USING btree ("text_key");--> statement-breakpoint
ALTER TABLE "text_gestures" ADD CONSTRAINT "text_gestures_text_script_id_unique" UNIQUE("text","script_id");--> statement-breakpoint
ALTER TABLE "text_lessons" ADD CONSTRAINT "text_lessons_text_lang_id_unique" UNIQUE("text","lang_id");