CREATE TYPE "public"."image_asset_type_enum" AS ENUM('ai_generated', 'recorded');--> statement-breakpoint
ALTER TABLE "audio_assets" ADD COLUMN "type" "image_asset_type_enum" DEFAULT 'ai_generated' NOT NULL;--> statement-breakpoint
CREATE INDEX "audio_assets_type_idx" ON "audio_assets" USING btree ("type");