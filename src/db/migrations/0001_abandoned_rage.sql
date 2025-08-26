ALTER TABLE "text_data" ADD COLUMN "gestures" jsonb;--> statement-breakpoint
ALTER TABLE "text_data" DROP COLUMN "svg_json";--> statement-breakpoint
ALTER TABLE "text_data" DROP COLUMN "strokes_json";