CREATE TABLE "text_data" (
	"id" serial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"text" text NOT NULL,
	"svg_json" jsonb NOT NULL,
	"strokes_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "text_data_text_idx" ON "text_data" USING btree ("text");