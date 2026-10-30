CREATE TABLE "agent_batch_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"text_gesture_id" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"chat_id" text,
	"tool_call_id" text,
	"proposal" jsonb,
	"based_on_revision" integer,
	"applied_revision" integer,
	"cost" real DEFAULT 0 NOT NULL,
	"error" text,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"qstash_message_id" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_batch_items_batch_gesture_unique" UNIQUE("batch_id","text_gesture_id")
);
--> statement-breakpoint
CREATE TABLE "agent_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"user_id" text NOT NULL,
	"model" text NOT NULL,
	"prompt" text NOT NULL,
	"reference" text DEFAULT 'none' NOT NULL,
	"auto_apply" text DEFAULT 'never' NOT NULL,
	"parallelism" smallint NOT NULL,
	"budget_usd" real,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_chats" ADD COLUMN "streaming_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_batch_items" ADD CONSTRAINT "agent_batch_items_batch_id_agent_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."agent_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_batch_items" ADD CONSTRAINT "agent_batch_items_text_gesture_id_text_gestures_id_fk" FOREIGN KEY ("text_gesture_id") REFERENCES "public"."text_gestures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_batch_items" ADD CONSTRAINT "agent_batch_items_chat_id_agent_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."agent_chats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_batch_items_gesture_idx" ON "agent_batch_items" USING btree ("text_gesture_id");--> statement-breakpoint
CREATE INDEX "agent_batch_items_status_idx" ON "agent_batch_items" USING btree ("batch_id","status");