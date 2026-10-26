import { createFileRoute } from '@tanstack/react-router';
import { consumeStream, convertToModelMessages, createIdGenerator, validateUIMessages } from 'ai';
import { Effect } from 'effect';
import { z } from 'zod';
import { gestureRefToModelText, AGENT_DATA_SCHEMAS } from '~/agents/gesture_refs';
import { agent_model_id_schema } from '~/agents/models';
import { createAgent } from '~/agents/server/create_agent';
import {
  findAgentChat,
  loadAgentMessages,
  saveAgentMessages,
  setChatStreaming
} from '~/agents/server/chat_store';
import {
  closeDanglingToolCalls,
  mergeClientToolOutputs,
  newMessageRefs,
  pruneHarnessImages,
  withHistoryCacheBreakpoint,
  withResolvedRefs
} from '~/agents/server/chat_messages';
import { resolveGestureRefs } from '~/agents/server/gesture_refs';
import { generateChatTitle } from '~/agents/server/chat_title';
import { createReplyMeter } from '~/agents/server/cost';
import type { AgentUIMessage } from '~/agents/ui_message';
import { enqueueBackground } from '~/effect/background';
import { BadRequestError } from '~/effect/errors';
import { runRouteEffect } from '~/effect/run';
import { appRuntime } from '~/effect/runtime';
import { getServerUserSession$ } from '~/lib/get_auth_from_cookie';
import { isSameOriginRequest } from '~/lib/same_origin';

const body_schema = z.object({
  id: z.string().min(1).max(64),
  /**
   * The new user message (history is loaded from the database), or — in a Gesture Creator chat —
   * the last assistant message carrying the results of tools the browser ran.
   */
  message: z
    .object({ id: z.string().min(1), role: z.enum(['user', 'assistant']) })
    .passthrough(),
  model: agent_model_id_schema
});

const generateMessageId = createIdGenerator({ prefix: 'msg', size: 16 });

const firstText = (message: AgentUIMessage) =>
  message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join(' ')
    .trim();

/** The turn that ended on a browser tool call is saved as its stream closes: wait for it. */
const waitForSavedTurn = Effect.fn('agents.wait_for_saved_turn')(function* (
  chatId: string,
  userId: string
) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const chat = yield* findAgentChat(chatId, userId);
    if (!chat.streaming) return chat;
    yield* Effect.sleep('250 millis');
  }
  return yield* Effect.fail(BadRequestError.make({ message: 'The previous step is still being saved' }));
});

async function handleChat(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return new Response('Cross-site request rejected', { status: 403 });
  }
  const session = await getServerUserSession$();
  const user = session?.user;
  if (user?.role !== 'admin') return new Response('Forbidden', { status: 403 });

  const parsed = body_schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400 });
  const { id, model } = parsed.data;
  // SAFETY: shape checked by validateUIMessages below before anything uses it.
  const incoming = parsed.data.message as unknown as AgentUIMessage;

  return runRouteEffect(
    Effect.gen(function* () {
      const isToolResult = incoming.role === 'assistant';
      const chat = isToolResult ? yield* waitForSavedTurn(id, user.id) : yield* findAgentChat(id, user.id);
      if (isToolResult && chat.agent_kind !== 'gesture_creator') {
        return yield* Effect.fail(BadRequestError.make({ message: 'This chat has no browser tools' }));
      }
      const previous = yield* loadAgentMessages(id);
      const { agent, tools } = yield* createAgent(model, chat.agent_kind);

      let conversation: AgentUIMessage[];
      if (isToolResult) {
        const stored = previous.at(-1);
        if (stored?.id !== incoming.id || stored.role !== 'assistant') {
          return yield* Effect.fail(
            BadRequestError.make({ message: 'Those tool results belong to an older step of this chat' })
          );
        }
        conversation = [...previous.slice(0, -1), mergeClientToolOutputs(stored, incoming)];
      } else {
        // A retry resends a message that may already be stored: replay history up to it.
        const resent = previous.findIndex((message) => message.id === incoming.id);
        const history = resent === -1 ? previous : previous.slice(0, resent);
        conversation = [...history, incoming];
      }

      const validated = yield* Effect.tryPromise({
        try: () =>
          validateUIMessages<AgentUIMessage>({
            messages: closeDanglingToolCalls(conversation),
            tools,
            dataSchemas: AGENT_DATA_SCHEMAS
          }),
        catch: () => BadRequestError.make({ message: 'Invalid message' })
      });
      // Fill a new message's @ mentions from the database, never from the client.
      const messages = isToolResult
        ? validated
        : [
            ...validated.slice(0, -1),
            withResolvedRefs(validated.at(-1)!, yield* resolveGestureRefs(newMessageRefs(validated.at(-1)!)))
          ];

      // Title the chat in parallel with the first reply.
      const titlePromise =
        !isToolResult && !chat.title && messages.length === 1
          ? appRuntime.runPromise(generateChatTitle(firstText(messages[0]!)))
          : null;

      const meter = createReplyMeter(model, isToolResult ? messages.at(-1)?.metadata : undefined);

      yield* setChatStreaming(id, true);
      const result = yield* Effect.promise(async () =>
        agent.stream({
          prompt: withHistoryCacheBreakpoint(
            await convertToModelMessages<AgentUIMessage>(pruneHarnessImages(messages), {
              tools,
              convertDataPart: gestureRefToModelText
            })
          ),
          // The Gesture Creator needs the open page to run its tools: stop when the page goes.
          abortSignal: chat.agent_kind === 'gesture_creator' ? request.signal : undefined
        })
      ).pipe(Effect.onError(() => Effect.ignore(setChatStreaming(id, false))));

      return result.toUIMessageStreamResponse<AgentUIMessage>({
        originalMessages: messages,
        generateMessageId,
        // Keep generating (and saving) even if the admin closes the tab mid-reply.
        consumeSseStream: ({ stream }) =>
          appRuntime.runSync(enqueueBackground(() => consumeStream({ stream }))),
        // Actual cost and tokens, continuing from the stored message when resuming after tools.
        messageMetadata: ({ part }) => meter(part),
        onFinish: async ({ messages: finished }) => {
          try {
            const title = titlePromise ? await titlePromise : undefined;
            await appRuntime.runPromise(
              saveAgentMessages({ chatId: id, messages: finished, model, title })
            );
          } finally {
            await appRuntime.runPromise(setChatStreaming(id, false));
          }
        },
        onError: (error) => {
          void appRuntime.runPromise(setChatStreaming(id, false));
          return error instanceof Error ? error.message : 'The agent failed to reply.';
        }
      });
    }),
    { onSuccess: (response) => response }
  );
}

export const Route = createFileRoute('/api/agents/chat')({
  server: {
    handlers: {
      POST: ({ request }) => handleChat(request)
    }
  }
});
