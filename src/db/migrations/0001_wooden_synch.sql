ALTER TABLE "text_data" ADD COLUMN "gestures" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "text_data" DROP COLUMN "svg_json";--> statement-breakpoint
ALTER TABLE "text_data" DROP COLUMN "strokes_json";