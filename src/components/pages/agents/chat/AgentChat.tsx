import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { useQueryClient } from '@tanstack/react-query';
import { useBlocker } from '@tanstack/react-router';
import type { inferRouterOutputs } from '@trpc/server';
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls
} from 'ai';
import { AlertCircleIcon, LibraryBigIcon, RotateCcwIcon, XIcon } from 'lucide-react';
import { useTRPC } from '~/api/client';
import type { AppRouter } from '~/api/trpc_router';
import { AGENT_KIND_META } from '~/agents/agent_kinds';
import { createGestureHarness, HarnessCancelledError } from '~/agents/gesture_creator/harness';
import { isGestureCreatorToolName, type GestureCreatorToolName } from '~/agents/gesture_creator/schemas';
import type { AgentModelId } from '~/agents/models';
import type { AgentUIMessage } from '~/agents/ui_message';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '~/components/ui/alert-dialog';
import { Button } from '~/components/ui/button';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport
} from '~/components/ui/message-scroller';
import { Spinner } from '~/components/ui/spinner';
import { AGENT_ICONS, AGENT_SUGGESTIONS } from '../agent_meta';
import { ContextDialog } from '../context/ContextDialog';
import { hasPendingMessage, takePendingMessage } from '../pending_message';
import { MobileHistoryButton } from '../sidebar/AgentsSidebar';
import { AgentChatProvider } from './agent_chat_context';
import { AssistantMessage, ThinkingLine, UserMessage } from './AgentMessage';
import { ChatComposer, type ComposerMessage } from './ChatComposer';
import { ModelPicker } from './ModelPicker';

export type AgentChatData = inferRouterOutputs<AppRouter>['agents']['get_chat'];

/** A composed message as UI parts: mentioned gestures first, then the text. */
const toUserParts = ({ text, refs }: ComposerMessage): AgentUIMessage['parts'] => [
  ...refs.map((data) => ({ type: 'data-gesture_ref' as const, data })),
  { type: 'text', text }
];

/** Browser tool calls of the message that still wait for a result. */
const pendingHarnessCalls = (message: AgentUIMessage | undefined) =>
  message?.role !== 'assistant'
    ? []
    : message.parts.filter(
        (part) =>
          isToolUIPart(part) &&
          isGestureCreatorToolName(getToolName(part)) &&
          (part.state === 'input-streaming' || part.state === 'input-available')
      );

const CANCELLED = 'Cancelled by the admin.';

export function AgentChat({ data }: { data: AgentChatData }) {
  const { chat } = data;
  const isCreator = chat.agent_kind === 'gesture_creator';
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [model, setModel] = useState<AgentModelId>(chat.model);
  const [contextOpen, setContextOpen] = useState(false);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<AgentUIMessage>({
        api: '/api/agents/chat',
        // Only the last message (a new user message, or the assistant message carrying browser
        // tool results) plus the per-request model: history is loaded server-side.
        prepareSendMessagesRequest: ({ id, messages, body }) => ({
          body: { ...body, id, message: messages.at(-1) }
        })
      }),
    []
  );

  const harness = useMemo(
    () =>
      isCreator
        ? createGestureHarness({
            loadGesture: (id) =>
              queryClient.fetchQuery(trpc.agents.get_gesture.queryOptions({ id }, { staleTime: 0 }))
          })
        : null,
    [isCreator, queryClient, trpc]
  );

  const refreshSidebar = () =>
    void queryClient.invalidateQueries({ queryKey: trpc.agents.list_chats.queryKey() });

  // ---- Gesture Creator run state ------------------------------------------------------------
  /** Set by Cancel: no further tool runs or automatic sends until the admin sends again. */
  const cancelledRef = useRef(false);
  const toolAbortRef = useRef<AbortController | null>(null);
  const [runningTools, setRunningTools] = useState(0);
  /** An attempt is in progress: from a send until a reply ends without pending browser tools. */
  const [liveRun, setLiveRun] = useState(() => isCreator && hasPendingMessage(chat.id));
  const messagesRef = useRef<AgentUIMessage[]>(data.messages);

  const { messages, sendMessage, setMessages, status, stop, error, regenerate, addToolOutput } =
    useChat<AgentUIMessage>({
      id: chat.id,
      messages: data.messages,
      transport,
      // Browser tool results go straight back to the agent, unless the admin cancelled.
      sendAutomaticallyWhen: ({ messages: current }) =>
        isCreator && !cancelledRef.current && lastAssistantMessageIsCompleteWithToolCalls({ messages: current }),
      onToolCall: async ({ toolCall }) => {
        if (!harness || toolCall.dynamic || !isGestureCreatorToolName(toolCall.toolName)) return;
        if (cancelledRef.current) return;
        const tool: GestureCreatorToolName = toolCall.toolName;
        toolAbortRef.current ??= new AbortController();
        const { signal } = toolAbortRef.current;
        setRunningTools((n) => n + 1);
        // SAFETY: addToolOutput is typed per tool name; `tool` and the harness output match.
        const submit = addToolOutput as (args: Record<string, unknown>) => Promise<void>;
        try {
          const output = await harness.run(tool, toolCall.input, { messages: messagesRef.current, signal });
          if (cancelledRef.current) return;
          // not awaited: awaiting inside onToolCall can deadlock the chat's job queue
          void submit({ tool, toolCallId: toolCall.toolCallId, output });
        } catch (failure) {
          if (cancelledRef.current || failure instanceof HarnessCancelledError) return;
          const errorText = failure instanceof Error ? failure.message : String(failure);
          void submit({ tool, toolCallId: toolCall.toolCallId, state: 'output-error', errorText });
        } finally {
          setRunningTools((n) => n - 1);
        }
      },
      onFinish: ({ message, isError }) => {
        if (isError || pendingHarnessCalls(message).length === 0) setLiveRun(false);
        refreshSidebar();
        // Title + streaming flag land with the save; pick up the fresh chat state.
        void queryClient.invalidateQueries({
          queryKey: trpc.agents.get_chat.queryKey({ id: chat.id })
        });
        // The title is saved as the stream closes; pick it up a moment later too.
        setTimeout(refreshSidebar, 1_500);
      }
    });
  useLayoutEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const busy = status === 'submitted' || status === 'streaming';
  // A failed request ends the attempt (Retry starts a new one).
  const runActive = isCreator && ((liveRun && status !== 'error') || busy || runningTools > 0);

  // Set once this view sends: from then on the local conversation wins over refetches.
  const sentLocally = useRef(false);

  /** Refs for a new turn; the caller marks the run live (initial state covers the first message). */
  const resetTurnRefs = useCallback(() => {
    sentLocally.current = true;
    cancelledRef.current = false;
    toolAbortRef.current = new AbortController();
  }, []);

  const beginTurn = () => {
    resetTurnRefs();
    if (isCreator) setLiveRun(true);
  };

  useEffect(() => {
    const pending = takePendingMessage(chat.id);
    if (pending) {
      resetTurnRefs();
      void sendMessage({ parts: toUserParts(pending) }, { body: { model: chat.model } });
    }
  }, [chat.id, chat.model, sendMessage, resetTurnRefs]);

  const send = (message: ComposerMessage) => {
    beginTurn();
    void sendMessage({ parts: toUserParts(message) }, { body: { model } });
  };

  /** Stop the reply, abort a running browser tool and mark waiting tool calls as cancelled. */
  const cancelRun = useCallback(async () => {
    cancelledRef.current = true;
    toolAbortRef.current?.abort();
    toolAbortRef.current = null;
    await stop();
    // SAFETY: as in onToolCall — the tool names come from the parts themselves.
    const submit = addToolOutput as (args: Record<string, unknown>) => Promise<void>;
    for (const part of pendingHarnessCalls(messagesRef.current.at(-1))) {
      if (!isToolUIPart(part)) continue;
      void submit({ tool: getToolName(part), toolCallId: part.toolCallId, state: 'output-error', errorText: CANCELLED });
    }
    setLiveRun(false);
  }, [stop, addToolOutput]);

  // A reply generated elsewhere (background stream, another tab) lands in the DB while this
  // view is idle: adopt it so refresh / back-navigation shows the finished turn.
  useEffect(() => {
    if (
      !busy &&
      !runActive &&
      !sentLocally.current &&
      !data.chat.streaming &&
      data.messages.length > messages.length
    ) {
      setMessages(data.messages);
    }
  }, [busy, runActive, data.chat.streaming, data.messages, messages.length, setMessages]);

  // Warn before dropping an in-flight reply with a reload or tab close.
  useEffect(() => {
    if (!busy && !runActive) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [busy, runActive]);

  // The Gesture Creator works in this page: switching chats or leaving mid-attempt needs a yes.
  const runActiveRef = useRef(runActive);
  useLayoutEffect(() => {
    runActiveRef.current = runActive;
  }, [runActive]);
  const blocker = useBlocker({
    shouldBlockFn: () => runActiveRef.current,
    enableBeforeUnload: () => runActiveRef.current,
    withResolver: true
  });

  const lastMessage = messages.at(-1);
  const KindIcon = AGENT_ICONS[chat.agent_kind];

  return (
    <AgentChatProvider value={{ chatId: chat.id, agentKind: chat.agent_kind, runActive, harness }}>
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
          <MobileHistoryButton />
          <KindIcon className="size-4 shrink-0 text-primary" />
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {chat.title || 'New chat'}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {AGENT_KIND_META[chat.agent_kind].label}
            </span>
          </h1>
          <Button variant="outline" size="sm" onClick={() => setContextOpen(true)}>
            <LibraryBigIcon />
            Context
          </Button>
        </header>
        {!busy && !runActive && chat.streaming ? (
          <p
            role="status"
            className="flex items-center justify-center gap-2 border-b border-border/70 px-3 py-1.5 text-xs text-muted-foreground"
          >
            <span className="size-1.5 animate-pulse rounded-full bg-primary" />
            Replying in the background — it will appear here when it lands.
          </p>
        ) : null}

        <div className="relative min-h-0 flex-1">
          {messages.length === 0 && !busy ? (
            <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-5 px-4 text-center">
              <div className="flex flex-col gap-1">
                <p className="text-lg font-semibold">{AGENT_KIND_META[chat.agent_kind].label}</p>
                <p className="text-sm text-muted-foreground">{AGENT_KIND_META[chat.agent_kind].description}</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {AGENT_SUGGESTIONS[chat.agent_kind].map((suggestion) => (
                  <Button
                    key={suggestion}
                    variant="outline"
                    size="sm"
                    className="h-auto rounded-full py-1.5 whitespace-normal"
                    onClick={() => send({ text: suggestion, refs: [] })}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <MessageScrollerProvider autoScroll>
              <MessageScroller>
                <MessageScrollerViewport>
                  <MessageScrollerContent
                    aria-busy={busy}
                    className="mx-auto w-full max-w-3xl gap-6 px-4 py-6"
                  >
                    {messages.map((message) => (
                      <MessageScrollerItem
                        key={message.id}
                        messageId={message.id}
                        scrollAnchor={message.role === 'user'}
                      >
                        {message.role === 'user' ? (
                          <UserMessage message={message} />
                        ) : (
                          <AssistantMessage
                            message={message}
                            streaming={(busy || runActive) && message === lastMessage}
                          />
                        )}
                      </MessageScrollerItem>
                    ))}
                    {status === 'submitted' && lastMessage?.role === 'user' ? (
                      <MessageScrollerItem messageId="pending">
                        <ThinkingLine />
                      </MessageScrollerItem>
                    ) : null}
                    {error && !busy ? (
                      <MessageScrollerItem messageId="error">
                        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
                          <div className="flex min-w-0 flex-1 flex-col gap-2">
                            <p className="break-words">
                              {error.message || 'The agent failed to reply.'}
                            </p>
                            <Button
                              size="xs"
                              variant="outline"
                              className="self-start"
                              onClick={() => {
                                beginTurn();
                                void regenerate({ body: { model } });
                              }}
                            >
                              <RotateCcwIcon />
                              Retry
                            </Button>
                          </div>
                        </div>
                      </MessageScrollerItem>
                    ) : null}
                  </MessageScrollerContent>
                </MessageScrollerViewport>
                <MessageScrollerButton />
              </MessageScroller>
            </MessageScrollerProvider>
          )}
        </div>

        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-4 pb-4">
          {runActive ? (
            <div
              role="status"
              className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs"
            >
              <Spinner className="size-3.5 text-primary" />
              <span className="min-w-0 flex-1 text-foreground">
                {runningTools > 0 ? 'Drawing in this tab…' : 'Gesture Creator is working…'}
                <span className="ml-1 text-muted-foreground">Keep this chat open until it finishes.</span>
              </span>
              <Button size="xs" variant="outline" onClick={() => void cancelRun()}>
                <XIcon />
                Cancel attempt
              </Button>
            </div>
          ) : null}
          <ChatComposer
            busy={busy || runActive}
            onStop={() => void (isCreator ? cancelRun() : stop())}
            stopLabel={isCreator ? 'Cancel attempt' : 'Stop'}
            onSend={send}
            placeholder={
              isCreator
                ? 'Mention a gesture with @, or tell the agent how to draw…'
                : 'Ask about gestures, lessons, practice…'
            }
            toolbar={<ModelPicker value={model} onChange={setModel} disabled={busy || runActive} />}
            autoFocus
          />
        </div>
      </div>

      <ContextDialog open={contextOpen} onOpenChange={setContextOpen} agentKind={chat.agent_kind} />

      <AlertDialog open={blocker.status === 'blocked'}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gesture creation in progress</AlertDialogTitle>
            <AlertDialogDescription>
              The Gesture Creator draws in this page. Leaving now cancels the current attempt; the chat so far is
              kept and you can continue it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Stay</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                void cancelRun().then(() => blocker.proceed?.());
              }}
            >
              Cancel attempt and leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AgentChatProvider>
  );
}
