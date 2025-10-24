CREATE TABLE "user_gesture_recording_vectors" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_gesture_recording_id" integer NOT NULL,
	"index" smallint NOT NULL,
	"recorded_vector" real[] NOT NULL,
	"drawn_vector" real[] NOT NULL,
	"is_labelled" boolean
);
--> statement-breakpoint
CREATE TABLE "user_gesture_recordings" (
	"id" serial PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"script_id" smallint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_gesture_recording_vectors" ADD CONSTRAINT "user_gesture_recording_points_id_fk" FOREIGN KEY ("user_gesture_recording_id") REFERENCES "public"."user_gesture_recordings"("id") ON DELETE cascade ON UPDATE no action;