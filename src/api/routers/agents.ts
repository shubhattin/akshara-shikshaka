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
import { agentInstructionSections } from '~/agents/prompts/instructions';
import {
  createAgentChat,
  deleteAgentChat,
  findAgentChat,
  listAgentChats,
  loadAgentMessages,
  renameAgentChat
} from '~/agents/server/chat_store';

const chat_id_schema = z.string().min(1).max(64);

const list_chats_route = protectedAdminProcedure.query(({ ctx }) =>
  runTrpcEffect(listAgentChats(ctx.user.id))
);

const get_chat_route = protectedAdminProcedure
  .input(z.object({ id: chat_id_schema }))
  .query(({ input, ctx }) =>
    runTrpcEffect(
      Effect.gen(function* () {
        const chat = yield* findAgentChat(input.id, ctx.user.id);
        const messages = yield* loadAgentMessages(input.id);
        return { chat, messages };
      })
    )
  );

const create_chat_route = protectedAdminProcedure
  .input(
    z.object({ id: chat_id_schema, model: agent_model_id_schema, agent_kind: agent_kind_schema })
  )
  .mutation(({ input, ctx }) => runTrpcEffect(createAgentChat({ ...input, user_id: ctx.user.id })));

const rename_chat_route = protectedAdminProcedure
  .input(z.object({ id: chat_id_schema, title: z.string().trim().min(1).max(120) }))
  .mutation(({ input, ctx }) => runTrpcEffect(renameAgentChat({ ...input, user_id: ctx.user.id })));

const delete_chat_route = protectedAdminProcedure
  .input(z.object({ id: chat_id_schema }))
  .mutation(({ input, ctx }) => runTrpcEffect(deleteAgentChat(input.id, ctx.user.id)));

/** Everything the agent reads before the conversation, for the Context dialog. */
const get_context_route = protectedAdminProcedure
  .input(z.object({ agent_kind: agent_kind_schema }))
  .query(({ input }) => agentInstructionSections(input.agent_kind));

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
      replace_existing: z.boolean()
    })
  )
  .mutation(({ input, ctx }) =>
    runTrpcEffect(
      applyProposedGesture({
        chatId: input.chat_id,
        toolCallId: input.tool_call_id,
        userId: ctx.user.id,
        replaceExisting: input.replace_existing
      })
    )
  );

export const agents_router = t.router({
  list_chats: list_chats_route,
  get_chat: get_chat_route,
  create_chat: create_chat_route,
  rename_chat: rename_chat_route,
  delete_chat: delete_chat_route,
  get_context: get_context_route,
  list_mentionable_gestures: list_mentionable_gestures_route,
  get_gesture: get_gesture_route,
  apply_gesture: apply_gesture_route
});
