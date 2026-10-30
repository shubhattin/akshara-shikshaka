import { Effect } from 'effect';
import { z } from 'zod';
import { protectedAdminProcedure, t } from '~/api/trpc_init';
import { runTrpcEffect } from '~/effect/run';
import { agent_kind_schema } from '~/agents/agent_kinds';
import { agent_model_id_schema } from '~/agents/models';
import {
  applyProposedGesture,
  getGestureForAgent,
  listMentionableGestures
} from '~/agents/server/gestures';
import { agentContext } from '~/agents/prompts/instructions';
import {
  createAgentChat,
  deleteAgentChat,
  findAgentChat,
  listAgentChats,
  listChatsForGesture,
  loadAgentMessages,
  renameAgentChat,
  requestChatStop
} from '~/agents/server/chat_store';
import {
  getGestureHub,
  getReviewQueue,
  listGestureRevisions,
  revertGestureRevision,
  setGestureAgentNotes,
  setGestureReview
} from '~/agents/server/gesture_review';
import { loadFocusContext } from '~/agents/server/focus';
import { MAX_AGENT_NOTES_LENGTH, review_status_schema } from '~/agents/gesture_review';

const chat_id_schema = z.string().min(1).max(64);

const gesture_id_schema = z.int().positive();

/** Every chat (chats are shared between admins), newest first. */
const list_chats_route = protectedAdminProcedure.query(() => runTrpcEffect(listAgentChats()));

const get_chat_route = protectedAdminProcedure
  .input(z.object({ id: chat_id_schema }))
  .query(({ input }) =>
    runTrpcEffect(
      Effect.gen(function* () {
        const chat = yield* findAgentChat(input.id);
        const messages = yield* loadAgentMessages(input.id);
        return { chat, messages };
      })
    )
  );

const create_chat_route = protectedAdminProcedure
  .input(
    z.object({
      id: chat_id_schema,
      model: agent_model_id_schema,
      agent_kind: agent_kind_schema,
      /** A focused chat: works on this one gesture only (Gesture Creator). */
      focus_gesture_id: gesture_id_schema.optional()
    })
  )
  .mutation(({ input, ctx }) => runTrpcEffect(createAgentChat({ ...input, user_id: ctx.user.id })));

const rename_chat_route = protectedAdminProcedure
  .input(z.object({ id: chat_id_schema, title: z.string().trim().min(1).max(120) }))
  .mutation(({ input }) => runTrpcEffect(renameAgentChat(input)));

/** Stop the chat's reply for real: it otherwise keeps generating server-side once the tab lets go. */
const stop_reply_route = protectedAdminProcedure
  .input(z.object({ id: chat_id_schema }))
  .mutation(({ input }) => runTrpcEffect(requestChatStop(input.id)));

const delete_chat_route = protectedAdminProcedure
  .input(z.object({ id: chat_id_schema }))
  .mutation(({ input }) => runTrpcEffect(deleteAgentChat(input.id)));

/** Everything the agent reads before the conversation, for the Context dialog. */
const get_context_route = protectedAdminProcedure
  .input(
    z.object({ agent_kind: agent_kind_schema, focus_gesture_id: gesture_id_schema.optional() })
  )
  .query(({ input }) =>
    runTrpcEffect(
      Effect.gen(function* () {
        const focus =
          input.focus_gesture_id === undefined
            ? null
            : yield* loadFocusContext(input.focus_gesture_id);
        return agentContext(input.agent_kind, focus);
      })
    )
  );

/** Every gesture (all scripts), for the composer's `@` mention picker. */
const list_mentionable_gestures_route = protectedAdminProcedure.query(() =>
  runTrpcEffect(listMentionableGestures())
);

/** One gesture with its strokes and glyph settings: the Gesture Creator's tools read it. */
const get_gesture_route = protectedAdminProcedure
  .input(z.object({ id: z.int().positive() }))
  .query(({ input }) => runTrpcEffect(getGestureForAgent(input.id)));

/** Save a Gesture Creator proposal (read from the stored chat) to its gesture. */
const apply_gesture_route = protectedAdminProcedure
  .input(
    z.object({
      chat_id: chat_id_schema,
      tool_call_id: z.string().min(1).max(200),
      replace_existing: z.boolean(),
      /** The saved version the admin compared against; a newer save meanwhile is a conflict. */
      expected_revision: z.int().positive().optional()
    })
  )
  .mutation(({ input, ctx }) =>
    runTrpcEffect(
      applyProposedGesture({
        chatId: input.chat_id,
        toolCallId: input.tool_call_id,
        userId: ctx.user.id,
        replaceExisting: input.replace_existing,
        expectedRevision: input.expected_revision
      })
    )
  );

/** Chats about one gesture: focused on it, or free chats that mentioned or proposed it. */
const chats_for_gesture_route = protectedAdminProcedure
  .input(z.object({ gesture_id: gesture_id_schema }))
  .query(({ input }) => runTrpcEffect(listChatsForGesture(input.gesture_id)));

/** The gesture hub: the gesture with review fields, its sibling scripts and its chats. */
const gesture_hub_route = protectedAdminProcedure
  .input(z.object({ gesture_id: gesture_id_schema }))
  .query(({ input }) => runTrpcEffect(getGestureHub(input.gesture_id)));

const list_revisions_route = protectedAdminProcedure
  .input(z.object({ gesture_id: gesture_id_schema }))
  .query(({ input }) => runTrpcEffect(listGestureRevisions(input.gesture_id)));

const revert_revision_route = protectedAdminProcedure
  .input(
    z.object({
      gesture_id: gesture_id_schema,
      revision_id: z.int().positive(),
      expected_revision: z.int().positive()
    })
  )
  .mutation(({ input, ctx }) =>
    runTrpcEffect(
      revertGestureRevision({
        gestureId: input.gesture_id,
        revisionId: input.revision_id,
        expectedRevision: input.expected_revision,
        userId: ctx.user.id
      })
    )
  );

const set_review_route = protectedAdminProcedure
  .input(
    z.object({
      gesture_id: gesture_id_schema,
      status: review_status_schema,
      note: z.string().max(1000).default('')
    })
  )
  .mutation(({ input }) =>
    runTrpcEffect(
      setGestureReview({ gestureId: input.gesture_id, status: input.status, note: input.note })
    )
  );

const set_agent_notes_route = protectedAdminProcedure
  .input(z.object({ gesture_id: gesture_id_schema, notes: z.string().max(MAX_AGENT_NOTES_LENGTH) }))
  .mutation(({ input }) =>
    runTrpcEffect(setGestureAgentNotes({ gestureId: input.gesture_id, notes: input.notes }))
  );

/** Every gesture with what the review queue ranks it by. */
const review_queue_route = protectedAdminProcedure.query(() => runTrpcEffect(getReviewQueue()));

export const agents_router = t.router({
  list_chats: list_chats_route,
  get_chat: get_chat_route,
  create_chat: create_chat_route,
  rename_chat: rename_chat_route,
  delete_chat: delete_chat_route,
  stop_reply: stop_reply_route,
  get_context: get_context_route,
  list_mentionable_gestures: list_mentionable_gestures_route,
  get_gesture: get_gesture_route,
  apply_gesture: apply_gesture_route,
  chats_for_gesture: chats_for_gesture_route,
  gesture_hub: gesture_hub_route,
  list_revisions: list_revisions_route,
  revert_revision: revert_revision_route,
  set_review: set_review_route,
  set_agent_notes: set_agent_notes_route,
  review_queue: review_queue_route
});
