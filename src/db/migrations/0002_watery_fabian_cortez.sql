DROP INDEX "text_data_text_idx";--> statement-breakpoint
ALTER TABLE "text_data" ADD COLUMN "script_id" smallint NOT NULL;--> statement-breakpoint
CREATE INDEX "text_data_script_text_id_idx" ON "text_data" USING btree ("script_id","text");