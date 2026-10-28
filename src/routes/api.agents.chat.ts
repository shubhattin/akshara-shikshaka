import { createFileRoute } from '@tanstack/react-router';
import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStreamResponse,
  validateUIMessages
} from 'ai';
import { Effect } from 'effect';
import { z } from 'zod';
import { dataPartToModel, AGENT_DATA_SCHEMAS } from '~/agents/gesture_refs';
import { findTraceInMessages } from '~/agents/gesture_creator/harness';
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
  newMessageRefs,
  pruneHarnessImages,
  withHistoryCacheBreakpoint,
  withResolvedRefs
} from '~/agents/server/chat_messages';
import { resolveDraftEdit, withoutDraftParts } from '~/agents/server/draft_edits';
import { resolveGestureRefs, withoutSavedStrokes } from '~/agents/server/gesture_refs';
import { createServerGestureHarness } from '~/agents/tools/gesture_creator_tools';
import { generateChatTitle } from '~/agents/server/chat_title';
import { createReplyMeter } from '~/agents/server/cost';
import { trackReplyProgress } from '~/agents/server/reply_progress';
import type { AgentUIMessage } from '~/agents/ui_message';
import { enqueueBackground } from '~/effect/background';
import { BadRequestError } from '~/effect/errors';
import { runRouteEffect } from '~/effect/run';
import { appRuntime } from '~/effect/runtime';
import { getServerUserSession$ } from '~/lib/get_auth_from_cookie';
import { isSameOriginRequest } from '~/lib/same_origin';

const body_schema = z.object({
  id: z.string().min(1).max(64),
  /** The new user message; history is loaded from the database. */
  message: z.object({ id: z.string().min(1), role: z.literal('user') }).passthrough(),
  model: agent_model_id_schema
});

const generateMessageId = createIdGenerator({ prefix: 'msg', size: 16 });

const firstText = (message: AgentUIMessage) =>
  message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join(' ')
    .trim();

/**
 * Wait until the chat's in-flight turn is saved (a stopped reply still landing). Otherwise its
 * late save would drop the turn that follows.
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
const chatForTurn = Effect.fn('agents.chat_for_turn')(function* (chatId: string, userId: string) {
  const chat = yield* findAgentChat(chatId, userId);
  if (!chat.streaming) return chat;
  // Send now, or Stop then send: the new message replaces whatever is still replying.
  yield* requestChatStop(chatId, userId);
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
      const chat = yield* chatForTurn(id, user.id);
      const previous = yield* loadAgentMessages(id);
      // What the tools look traces up in: the stored history, then the new message too.
      let known: readonly AgentUIMessage[] = previous;
      const { agent, tools } = yield* createAgent(model, chat.agent_kind, () => known);

      const validatedIncoming = yield* Effect.tryPromise({
        try: () =>
          validateUIMessages<AgentUIMessage>({
            messages: [incomingRaw],
            tools,
            dataSchemas: AGENT_DATA_SCHEMAS
          }).then((messages) => messages[0]!),
        catch: () => BadRequestError.make({ message: 'Invalid message' })
      });

      // A retry resends a message that may already be stored: replay history up to it.
      const resent = previous.findIndex((message) => message.id === validatedIncoming.id);
      const history = resent === -1 ? previous : previous.slice(0, resent);
      const conversation = [...history, validatedIncoming];

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
      const withRefs = withResolvedRefs(
        validated.at(-1)!,
        yield* resolveGestureRefs(
          newMessageRefs(validated.at(-1)!),
          chat.agent_kind,
          validated.slice(0, -1)
        )
      );
      const earlier = validated.slice(0, -1);
      // An admin's draft edit is traced here; the client's copy of the result is never used.
      const incoming =
        chat.agent_kind === 'gesture_creator'
          ? yield* Effect.tryPromise({
              try: (signal) =>
                resolveDraftEdit(
                  withRefs,
                  earlier,
                  createServerGestureHarness((traceId) => findTraceInMessages(earlier, traceId)),
                  signal
                ),
              catch: () => BadRequestError.make({ message: 'Could not trace the edited draft' })
            })
          : withoutDraftParts(withRefs);
      const messages = [...earlier, incoming];
      // What the model reads: older images dropped; the Gesture Creator never sees saved strokes.
      const modelView = (all: AgentUIMessage[]) => {
        const pruned = pruneHarnessImages(all);
        return chat.agent_kind === 'gesture_creator' ? withoutSavedStrokes(pruned) : pruned;
      };
      known = messages;

      // Title the chat in parallel with the first reply.
      const titlePromise =
        !chat.title && messages.length === 1
          ? appRuntime.runPromise(generateChatTitle(firstText(messages[0]!)))
          : null;

      const meter = createReplyMeter(model);

      yield* setChatStreaming(id, true);
      // Only an explicit Stop ends the reply: closing or reloading the tab leaves it running.
      const stop = new AbortController();
      const stopWatching = watchForStop(id, stop);
      const result = yield* Effect.promise(async () =>
        agent.stream({
          prompt: withHistoryCacheBreakpoint(
            await convertToModelMessages<AgentUIMessage>(modelView(messages), {
              tools,
              convertDataPart: dataPartToModel
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

      let progress: ReturnType<typeof trackReplyProgress<AgentUIMessage>> | undefined;
      const stream = result.toUIMessageStream<AgentUIMessage>({
        originalMessages: messages,
        generateMessageId,
        // Actual cost and tokens of every step.
        messageMetadata: ({ part }) => meter(part),
        onFinish: async ({ messages: finished }) => {
          try {
            await progress?.settle();
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
          void progress?.settle().then(() => appRuntime.runPromise(setChatStreaming(id, false)));
          return error instanceof Error ? error.message : 'The agent failed to reply.';
        }
      });

      // One copy to the client, one read here to the end: the reply keeps generating (and is
      // saved after every step) even if the admin closes or reloads the tab.
      const [toClient, toServer] = stream.tee();
      const tracked = trackReplyProgress<AgentUIMessage>(toServer, (reply) =>
        appRuntime.runPromise(
          saveAgentMessages({ chatId: id, messages: [...messages, reply], model })
        )
      );
      progress = tracked;
      appRuntime.runSync(enqueueBackground(() => tracked.done));

      return createUIMessageStreamResponse({ stream: toClient });
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
