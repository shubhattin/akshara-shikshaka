-- Gestures saved before review existed were drawn and checked by hand: they start approved.
-- Only strokes changed by an agent proposal (or a restore) from now on wait for a review.
UPDATE "text_gestures"
SET "review_status" = 'approved', "review_note" = ''
WHERE "review_status" = 'unreviewed' AND jsonb_array_length("gestures") > 0;
