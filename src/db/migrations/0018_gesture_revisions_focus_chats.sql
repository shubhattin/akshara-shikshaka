CREATE TABLE "agent_chat_gestures" (
	"chat_id" text NOT NULL,
	"text_gesture_id" integer NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_proposal_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	CONSTRAINT "agent_chat_gestures_chat_id_text_gesture_id_pk" PRIMARY KEY("chat_id","text_gesture_id")
);
--> statement-breakpoint
CREATE TABLE "text_gesture_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"text_gesture_id" integer NOT NULL,
	"revision_no" integer NOT NULL,
	"gestures" jsonb NOT NULL,
	"font_family" text NOT NULL,
	"font_size" smallint NOT NULL,
	"text_center_offset" jsonb NOT NULL,
	"source" text NOT NULL,
	"chat_id" text,
	"tool_call_id" text,
	"reverted_from" integer,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "text_gesture_revisions_gesture_revision_unique" UNIQUE("text_gesture_id","revision_no")
);
--> statement-breakpoint
ALTER TABLE "agent_chats" ADD COLUMN "focus_gesture_id" integer;--> statement-breakpoint
ALTER TABLE "text_gestures" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "text_gestures" ADD COLUMN "review_status" text DEFAULT 'unreviewed' NOT NULL;--> statement-breakpoint
ALTER TABLE "text_gestures" ADD COLUMN "review_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "text_gestures" ADD COLUMN "agent_notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_chat_gestures" ADD CONSTRAINT "agent_chat_gestures_chat_id_agent_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."agent_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_chat_gestures" ADD CONSTRAINT "agent_chat_gestures_text_gesture_id_text_gestures_id_fk" FOREIGN KEY ("text_gesture_id") REFERENCES "public"."text_gestures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_gesture_revisions" ADD CONSTRAINT "text_gesture_revisions_text_gesture_id_text_gestures_id_fk" FOREIGN KEY ("text_gesture_id") REFERENCES "public"."text_gestures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_gesture_revisions" ADD CONSTRAINT "text_gesture_revisions_chat_id_agent_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."agent_chats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_chat_gestures_gesture_idx" ON "agent_chat_gestures" USING btree ("text_gesture_id");--> statement-breakpoint
CREATE INDEX "text_gesture_revisions_chat_id_idx" ON "text_gesture_revisions" USING btree ("chat_id");--> statement-breakpoint
ALTER TABLE "agent_chats" ADD CONSTRAINT "agent_chats_focus_gesture_id_text_gestures_id_fk" FOREIGN KEY ("focus_gesture_id") REFERENCES "public"."text_gestures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_chats_focus_gesture_id_idx" ON "agent_chats" USING btree ("focus_gesture_id");--> statement-breakpoint
ALTER TABLE "agent_chats" ADD CONSTRAINT "agent_chats_focus_only_creator" CHECK ("agent_chats"."focus_gesture_id" is null or "agent_chats"."agent_kind" = 'gesture_creator');--> statement-breakpoint
-- Backfill: every existing gesture's current state becomes its first revision.
INSERT INTO "text_gesture_revisions" ("text_gesture_id", "revision_no", "gestures", "font_family", "font_size", "text_center_offset", "source", "created_at")
SELECT "id", "revision", "gestures", "font_family", "font_size", "text_center_offset", 'initial', "updated_at"
FROM "text_gestures";--> statement-breakpoint
-- Backfill: the gestures each stored chat mentioned (@ refs) or proposed.
INSERT INTO "agent_chat_gestures" ("chat_id", "text_gesture_id", "first_seen_at", "last_proposal_at")
SELECT links."chat_id", links."gesture_id", min(links."created_at"), max(links."proposed_at")
FROM (
	SELECT m."chat_id",
		CASE
			WHEN p->>'type' = 'data-gesture_ref' THEN (p->'data'->>'id')::integer
			ELSE (p->'output'->'proposal'->>'gesture_id')::integer
		END AS "gesture_id",
		m."created_at",
		CASE WHEN p->>'type' = 'tool-propose_gesture' THEN m."created_at" END AS "proposed_at"
	FROM "agent_messages" m, jsonb_array_elements(m."parts") p
	WHERE (p->>'type' = 'data-gesture_ref' AND p->'data'->>'id' ~ '^[0-9]+$')
		OR (p->>'type' = 'tool-propose_gesture' AND p->>'state' = 'output-available'
			AND p->'output'->'proposal'->>'gesture_id' ~ '^[0-9]+$')
) links
INNER JOIN "text_gestures" g ON g."id" = links."gesture_id"
GROUP BY links."chat_id", links."gesture_id"
ON CONFLICT DO NOTHING;
