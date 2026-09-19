ALTER TABLE "user_gesture_recordings" ADD COLUMN "user_id" text;--> statement-breakpoint
CREATE INDEX "user_gesture_recording_vectors_recording_id_idx" ON "user_gesture_recording_vectors" USING btree ("user_gesture_recording_id");--> statement-breakpoint
CREATE INDEX "user_gesture_recordings_created_at_idx" ON "user_gesture_recordings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_gesture_recordings_script_created_at_idx" ON "user_gesture_recordings" USING btree ("script_id","created_at");--> statement-breakpoint
CREATE INDEX "user_gesture_recordings_text_script_created_at_idx" ON "user_gesture_recordings" USING btree ("text","script_id","created_at");--> statement-breakpoint
CREATE INDEX "user_gesture_recordings_completed_created_at_idx" ON "user_gesture_recordings" USING btree ("completed","created_at");--> statement-breakpoint
CREATE INDEX "user_gesture_recordings_user_id_idx" ON "user_gesture_recordings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_gesture_recordings_user_id_created_at_idx" ON "user_gesture_recordings" USING btree ("user_id","created_at");