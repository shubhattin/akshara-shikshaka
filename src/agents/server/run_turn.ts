import {
  convertToModelMessages,
  createIdGenerator,
  validateUIMessages,
  type UIMessageChunk
} from 'ai';
import { Effect } from 'effect';
import { dataPartToModel, AGENT_DATA_SCHEMAS } from '~/agents/gesture_refs';
import { findTraceInMessages } from '~/agents/gesture_creator/harness';
import type { AgentModelId } from '~/agents/models';
import { createAgent } from '~/agents/server/create_agent';
import {
  findAgentChat,
  isChatStopRequested,
  isChatStreaming,
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
import { focusedRefs } from '~/agents/focus';
import { loadFocusContext } from '~/agents/server/focus';
import { resolveSavedView } from '~/agents/server/saved_views';
import { generateChatTitle } from '~/agents/server/chat_title';
import { createReplyMeter } from '~/agents/server/cost';
import { trackReplyProgress } from '~/agents/server/reply_progress';
import type { AgentUIMessage } from '~/agents/ui_message';
import { BadRequestError } from '~/effect/errors';
import { appRuntime } from '~/effect/runtime';

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
const waitForSavedTurn = Effect.fn('agents.wait_for_saved_turn')(function* (chatId: string) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const chat = yield* findAgentChat(chatId);
    if (!isChatStreaming(chat)) return chat;
    yield* Effect.sleep('250 millis');
  }
  return yield* Effect.fail(
    BadRequestError.make({
      message: 'The previous reply is still being saved, try again in a moment'
    })
  );
});

/** The chat once any in-flight turn is saved; a new message stops that turn first. */
const chatForTurn = Effect.fn('agents.chat_for_turn')(function* (chatId: string) {
  const chat = yield* findAgentChat(chatId);
  if (!isChatStreaming(chat)) return chat;
  // Send now, or Stop then send: the new message replaces whatever is still replying.
  yield* requestChatStop(chatId);
  return yield* waitForSavedTurn(chatId);
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

/** How the turn ended, once its messages are saved. */
export type TurnOutcome = {
  /** The stream's error message, if the agent failed mid-reply. */
  error: string | null;
  aborted: boolean;
};

/**
 * Run one turn of a stored chat: validate the new user message, fill in what the server owns
 * (mentions, draft edits, saved views), stream the agent's reply and save it after every step
 * and at the end. Only an explicit Stop ends the reply.
 *
 * `toClient` is a copy of the reply for the browser (null when `withClientStream` is false, as
 * for batch runs). `done` resolves once the reply is read to the end and saved.
 */
export const startAgentTurn = Effect.fn('agents.start_turn')(function* (input: {
  chatId: string;
  /** The new user message, as received; validated here. */
  message: unknown;
  model: AgentModelId;
  withClientStream: boolean;
}) {
  const { chatId: id, model } = input;
  const chat = yield* chatForTurn(id);
  const previous = yield* loadAgentMessages(id);
  // A focused chat works on its gesture only (its notes and siblings are read fresh).
  const focus =
    chat.focus_gesture_id === null ? null : yield* loadFocusContext(chat.focus_gesture_id);
  // What the tools look traces up in: the stored history, then the new message too.
  let known: readonly AgentUIMessage[] = previous;
  const { agent, tools } = yield* createAgent(model, chat.agent_kind, () => known, focus);

  const validatedIncoming = yield* Effect.tryPromise({
    try: () =>
      validateUIMessages<AgentUIMessage>({
        messages: [input.message],
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
  const earlier = validated.slice(0, -1);
  // A focused chat's first message carries its gesture; other gestures are refused.
  let refs = newMessageRefs(validated.at(-1)!);
  if (focus) {
    const scoped = focusedRefs(refs, earlier, focus.gesture);
    if (!scoped.ok) return yield* Effect.fail(BadRequestError.make({ message: scoped.error }));
    refs = scoped.refs;
  }
  // Stored messages this turn replaces (a retried reply, an empty cancelled one); nothing
  // else is deleted, so a turn another admin saved meanwhile in this shared chat stays.
  const kept = new Set(validated.map((message) => message.id));
  const replacedIds = previous.filter((message) => !kept.has(message.id)).map((m) => m.id);
  // Fill a new message's @ mentions from the database, never from the client.
  const withRefs = withResolvedRefs(
    validated.at(-1)!,
    yield* resolveGestureRefs(refs, chat.agent_kind, earlier)
  );
  // An admin's draft edit is traced here; the client's copy of the result is never used.
  const edited =
    chat.agent_kind === 'gesture_creator'
      ? yield* Effect.tryPromise({
          try: (signal) =>
            resolveDraftEdit(
              withRefs,
              earlier,
              createServerGestureHarness(
                (traceId) => findTraceInMessages(earlier, traceId),
                focus?.gesture.id ?? null
              ),
              signal
            ),
          catch: () => BadRequestError.make({ message: 'Could not trace the edited draft' })
        })
      : withoutDraftParts(withRefs);
  // Saved strokes the admin chose to show (focused chats only), drawn here.
  const incoming = yield* resolveSavedView(edited, focus);
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

  const outcome: TurnOutcome = { error: null, aborted: false };
  let progress: ReturnType<typeof trackReplyProgress<AgentUIMessage>> | undefined;
  const stream = result.toUIMessageStream<AgentUIMessage>({
    originalMessages: messages,
    generateMessageId,
    // Actual cost and tokens of every step.
    messageMetadata: ({ part }) => meter(part),
    onFinish: async ({ messages: finished, isAborted }) => {
      outcome.aborted = isAborted;
      try {
        await progress?.settle();
        const title = titlePromise ? await titlePromise : undefined;
        await appRuntime.runPromise(
          saveAgentMessages({ chatId: id, messages: finished, model, title, replacedIds })
        );
      } finally {
        stopWatching();
        await appRuntime.runPromise(setChatStreaming(id, false));
      }
    },
    onError: (error) => {
      stopWatching();
      void progress?.settle().then(() => appRuntime.runPromise(setChatStreaming(id, false)));
      const message = error instanceof Error ? error.message : 'The agent failed to reply.';
      outcome.error = message;
      return message;
    }
  });

  // One copy to the client (if any), one read here to the end: the reply keeps generating (and
  // is saved after every step) even if the admin closes or reloads the tab.
  let toClient: ReadableStream<UIMessageChunk> | null = null;
  let toServer = stream;
  if (input.withClientStream) [toClient, toServer] = stream.tee();
  const tracked = trackReplyProgress<AgentUIMessage>(toServer, (reply) =>
    appRuntime.runPromise(
      saveAgentMessages({ chatId: id, messages: [...messages, reply], model, replacedIds })
    )
  );
  progress = tracked;
  // The stream's flush awaits onFinish, so reading it to the end means the reply is saved.
  const done = tracked.done.then(() => outcome);

  return { toClient, done };
});
