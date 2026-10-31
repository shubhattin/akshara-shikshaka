-- Batch items now follow their gesture's saves (the app keeps them so from now on); settle the
-- ones left "to review" before that:
-- an item whose run proposed, and whose chat had a proposal applied after its last review, is
-- applied, as the newest save from that chat,
UPDATE "agent_batch_items" AS i
SET "status" = 'applied',
  "applied_revision" = r."revision_no",
  "reviewed_by" = r."user_id",
  "reviewed_at" = r."created_at"
FROM (
  SELECT DISTINCT ON ("text_gesture_id", "chat_id")
    "text_gesture_id", "chat_id", "revision_no", "user_id", "created_at"
  FROM "text_gesture_revisions"
  WHERE "source" = 'agent' AND "chat_id" IS NOT NULL
  ORDER BY "text_gesture_id", "chat_id", "revision_no" DESC
) AS r
WHERE i."text_gesture_id" = r."text_gesture_id"
  AND i."chat_id" = r."chat_id"
  AND i."status" IN ('proposed', 'applied', 'rejected')
  AND (i."reviewed_at" IS NULL OR i."reviewed_at" < r."created_at")
  AND (i."status" <> 'applied' OR i."applied_revision" IS DISTINCT FROM r."revision_no");--> statement-breakpoint
-- and a proposal still waiting for a version that was saved over since is superseded.
UPDATE "agent_batch_items" AS i
SET "status" = 'superseded', "reviewed_at" = NOW()
FROM "text_gestures" AS g
WHERE g."id" = i."text_gesture_id"
  AND i."status" = 'proposed'
  AND i."based_on_revision" IS NOT NULL
  AND g."revision" <> i."based_on_revision";
