import { createFileRoute } from '@tanstack/react-router';
import { consumeStream, convertToModelMessages, createIdGenerator, validateUIMessages } from 'ai';
import { Effect } from 'effect';
import { z } from 'zod';
import { gestureRefToModelText, AGENT_DATA_SCHEMAS } from '~/agents/gesture_refs';
import { agent_model_id_schema } from '~/agents/models';
import { createAgent } from '~/agents/server/create_agent';
import {
  findAgentChat,
  isChatStopRequested,
  loadAgentMessages,
  requestChatStop,
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
  message: z.object({ id: z.string().min(1), role: z.enum(['user', 'assistant']) }).passthrough(),
  model: agent_model_id_schema
});

const generateMessageId = createIdGenerator({ prefix: 'msg', size: 16 });

const firstText = (message: AgentUIMessage) =>
  message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join(' ')
    .trim();

/**
 * Wait until the chat's in-flight turn is saved: the step that ended on a browser tool call, or
 * a stopped reply still landing. Otherwise its late save would drop the turn that follows.
 */
const waitForSavedTurn = Effect.fn('agents.wait_for_saved_turn')(function* (
  chatId: string,
  userId: string
) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const chat = yield* findAgentChat(chatId, userId);
    if (!chat.streaming) return chat;
    yield* Effect.sleep('250 millis');
  }
  return yield* Effect.fail(
    BadRequestError.make({
      message: 'The previous reply is still being saved, try again in a moment'
    })
  );
});

/** The chat once any in-flight turn is saved; a new message stops that turn first. */
const chatForTurn = Effect.fn('agents.chat_for_turn')(function* (
  chatId: string,
  userId: string,
  isToolResult: boolean
) {
  const chat = yield* findAgentChat(chatId, userId);
  if (!chat.streaming) return chat;
  // Send now, or Stop then send: the new message replaces whatever is still replying.
  if (!isToolResult) yield* requestChatStop(chatId, userId);
  return yield* waitForSavedTurn(chatId, userId);
});

const STOP_POLL_MS = 1_000;

/**
 * Aborts the reply when an explicit Stop is recorded for the chat. The request may be served by
 * another instance than the Stop, so this polls the database rather than listening in memory.
 */
function watchForStop(chatId: string, controller: AbortController) {
  const timer = setInterval(() => {
    void appRuntime
      .runPromise(isChatStopRequested(chatId))
      .then((stop) => {
        if (stop) controller.abort();
      })
      .catch(() => undefined);
  }, STOP_POLL_MS);
  const clear = () => clearInterval(timer);
  controller.signal.addEventListener('abort', clear, { once: true });
  return clear;
}

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
  // Validated below with validateUIMessages before anything uses it beyond id/role.
  const incomingRaw = parsed.data.message;

  return runRouteEffect(
    Effect.gen(function* () {
      const isToolResult = incomingRaw.role === 'assistant';
      const chat = yield* chatForTurn(id, user.id, isToolResult);
      if (isToolResult && chat.agent_kind !== 'gesture_creator') {
        return yield* Effect.fail(
          BadRequestError.make({ message: 'This chat has no browser tools' })
        );
      }
      const previous = yield* loadAgentMessages(id);
      const { agent, tools } = yield* createAgent(model, chat.agent_kind);

      // The stored id check runs on the boundary-typed fields; the full shape is
      // decoded next so only validated messages enter the conversation.
      const incomingId = incomingRaw.id;
      if (isToolResult) {
        const stored = previous.at(-1);
        if (stored?.id !== incomingId || stored.role !== 'assistant') {
          return yield* Effect.fail(
            BadRequestError.make({
              message: 'Those tool results belong to an older step of this chat'
            })
          );
        }
      }
      const validatedIncoming = yield* Effect.tryPromise({
        try: () =>
          validateUIMessages<AgentUIMessage>({
            messages: [incomingRaw],
            tools,
            dataSchemas: AGENT_DATA_SCHEMAS
          }).then((messages) => messages[0]!),
        catch: () => BadRequestError.make({ message: 'Invalid message' })
      });

      let conversation: AgentUIMessage[];
      if (isToolResult) {
        const stored = previous.at(-1);
        if (stored?.id !== validatedIncoming.id || stored.role !== 'assistant') {
          return yield* Effect.fail(
            BadRequestError.make({
              message: 'Those tool results belong to an older step of this chat'
            })
          );
        }
        conversation = [
          ...previous.slice(0, -1),
          mergeClientToolOutputs(stored, validatedIncoming)
        ];
      } else {
        // A retry resends a message that may already be stored: replay history up to it.
        const resent = previous.findIndex((message) => message.id === validatedIncoming.id);
        const history = resent === -1 ? previous : previous.slice(0, resent);
        conversation = [...history, validatedIncoming];
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
            withResolvedRefs(
              validated.at(-1)!,
              yield* resolveGestureRefs(newMessageRefs(validated.at(-1)!))
            )
          ];

      // Title the chat in parallel with the first reply.
      const titlePromise =
        !isToolResult && !chat.title && messages.length === 1
          ? appRuntime.runPromise(generateChatTitle(firstText(messages[0]!)))
          : null;

      const meter = createReplyMeter(model, isToolResult ? messages.at(-1)?.metadata : undefined);

      yield* setChatStreaming(id, true);
      const stop = new AbortController();
      // The Gesture Creator needs the open page to run its tools: stop when the page goes.
      if (chat.agent_kind === 'gesture_creator') {
        request.signal.addEventListener('abort', () => stop.abort(), { once: true });
      }
      const stopWatching = watchForStop(id, stop);
      const result = yield* Effect.promise(async () =>
        agent.stream({
          prompt: withHistoryCacheBreakpoint(
            await convertToModelMessages<AgentUIMessage>(pruneHarnessImages(messages), {
              tools,
              convertDataPart: gestureRefToModelText
            })
          ),
          abortSignal: stop.signal
        })
      ).pipe(
        Effect.onError(() => {
          stopWatching();
          return Effect.ignore(setChatStreaming(id, false));
        })
      );

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
            stopWatching();
            await appRuntime.runPromise(setChatStreaming(id, false));
          }
        },
        onError: (error) => {
          stopWatching();
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
