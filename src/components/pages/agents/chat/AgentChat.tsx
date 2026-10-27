import { useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { useChat } from '@ai-sdk/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { inferRouterOutputs } from '@trpc/server';
import { DefaultChatTransport } from 'ai';
import { AlertCircleIcon, LibraryBigIcon, RotateCcwIcon } from 'lucide-react';
import { useTRPC } from '~/api/client';
import type { AppRouter } from '~/api/trpc_router';
import { AGENT_KIND_META, type AgentKind } from '~/agents/agent_kinds';
import { coerceAgentModelId, type AgentModelId } from '~/agents/models';
import type { AgentUIMessage } from '~/agents/ui_message';
import { Button } from '~/components/ui/button';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport
} from '~/components/ui/message-scroller';
import { AGENT_SUGGESTIONS } from '../agent_meta';
import { AgentKindIcon } from '../AgentKindIcon';
import { ContextDialog } from '../context/ContextDialog';
import { hasPendingMessage, takePendingMessage } from '../pending_message';
import { MobileHistoryButton } from '../sidebar/AgentsSidebar';
import { AgentChatProvider } from './agent_chat_context';
import { AssistantMessage, ThinkingLine, UserMessage } from './AgentMessage';
import { ChatComposer, type ComposerHandle, type ComposerMessage } from './ChatComposer';
import { ChatCost } from './ChatCost';
import { ModelPicker } from './ModelPicker';
import { QueuedMessages } from './QueuedMessages';
import { useMessageQueue } from './use_message_queue';

export type AgentChatData = inferRouterOutputs<AppRouter>['agents']['get_chat'];

/** A composed message as UI parts: mentioned gestures first, then the text. */
const toUserParts = ({ text, refs }: ComposerMessage): AgentUIMessage['parts'] => [
  ...refs.map((data) => ({ type: 'data-gesture_ref' as const, data })),
  { type: 'text', text }
];

/**
 * A cheap fingerprint of a conversation: the message ids plus how far the last one has got (part
 * count and the size of its last part), enough to tell a newer saved snapshot from the same one.
 */
function conversationKey(messages: AgentUIMessage[]): string {
  const last = messages.at(-1);
  const tail = last
    ? `${last.parts.length}:${JSON.stringify(last.parts.at(-1) ?? null).length}`
    : '';
  return `${messages.map((message) => message.id).join(',')}|${tail}`;
}

function BackgroundReplyNotice({ show }: { show: boolean }) {
  return show ? (
    <p
      role="status"
      className="flex items-center justify-center gap-2 border-b border-border/70 px-3 py-1.5 text-xs text-muted-foreground"
    >
      <span className="size-1.5 animate-pulse rounded-full bg-primary" />
      Replying on the server — steps appear here as they finish.
    </p>
  ) : null;
}

function EmptyChatPrompt({
  agentKind,
  onSend
}: {
  agentKind: AgentKind;
  onSend: (message: ComposerMessage) => void;
}) {
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-5 px-4 text-center">
      <div className="flex flex-col gap-1">
        <p className="text-lg font-semibold">{AGENT_KIND_META[agentKind].label}</p>
        <p className="text-sm text-muted-foreground">{AGENT_KIND_META[agentKind].description}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {AGENT_SUGGESTIONS[agentKind].map((suggestion) => (
          <Button
            key={suggestion}
            variant="outline"
            size="sm"
            className="h-auto rounded-full py-1.5 whitespace-normal"
            onClick={() => onSend({ text: suggestion, refs: [] })}
          >
            {suggestion}
          </Button>
        ))}
      </div>
    </div>
  );
}

function ChatTimeline({
  messages,
  busy,
  replying,
  status,
  error,
  onRetry
}: {
  messages: AgentUIMessage[];
  busy: boolean;
  /** The last reply is still being written (here or on the server). */
  replying: boolean;
  status: string;
  error: Error | undefined;
  onRetry: () => void;
}) {
  const lastMessage = messages.at(-1);
  return (
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
                    streaming={replying && message === lastMessage}
                  />
                )}
              </MessageScrollerItem>
            ))}
            {status === 'submitted' && lastMessage?.role === 'user' ? (
              <MessageScrollerItem messageId="pending">
                <ThinkingLine />
              </MessageScrollerItem>
            ) : null}
            {error && !replying ? (
              <MessageScrollerItem messageId="error">
                <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <p className="break-words">{error.message || 'The agent failed to reply.'}</p>
                    <Button size="xs" variant="outline" className="self-start" onClick={onRetry}>
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
  );
}

function TimelineSwitch({
  empty,
  messages,
  busy,
  replying,
  status,
  error,
  agentKind,
  onSend,
  onRetry
}: {
  empty: boolean;
  messages: AgentUIMessage[];
  busy: boolean;
  replying: boolean;
  status: string;
  error: Error | undefined;
  agentKind: AgentKind;
  onSend: (message: ComposerMessage) => void;
  onRetry: () => void;
}) {
  return (
    <>
      {empty ? (
        <EmptyChatPrompt agentKind={agentKind} onSend={onSend} />
      ) : (
        <ChatTimeline
          messages={messages}
          busy={busy}
          replying={replying}
          status={status}
          error={error}
          onRetry={onRetry}
        />
      )}
    </>
  );
}

function ComposerBar({
  composerRef,
  replying,
  isCreator,
  model,
  onSend,
  onStop,
  onModelChange
}: {
  composerRef: Ref<ComposerHandle>;
  replying: boolean;
  isCreator: boolean;
  model: AgentModelId;
  onSend: (message: ComposerMessage) => void;
  onStop: () => void;
  onModelChange: (model: AgentModelId) => void;
}) {
  return (
    <ChatComposer
      ref={composerRef}
      canQueue
      busy={replying}
      onStop={onStop}
      stopLabel={isCreator ? 'Cancel attempt' : 'Stop'}
      onSend={onSend}
      placeholder={
        isCreator
          ? 'Mention a gesture with @, or tell the agent how to draw…'
          : 'Ask about gestures, lessons, practice…'
      }
      toolbar={<ModelPicker value={model} onChange={onModelChange} disabled={replying} />}
      autoFocus
    />
  );
}

export function AgentChat({ data, fetchedAt }: { data: AgentChatData; fetchedAt: number }) {
  const { chat } = data;
  const isCreator = chat.agent_kind === 'gesture_creator';
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [model, setModel] = useState<AgentModelId>(() => coerceAgentModelId(chat.model));
  const [contextOpen, setContextOpen] = useState(false);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<AgentUIMessage>({
        api: '/api/agents/chat',
        // Only the new message plus the per-request model: history is loaded server-side.
        prepareSendMessagesRequest: ({ id, messages, body }) => ({
          body: { ...body, id, message: messages.at(-1) }
        })
      }),
    []
  );

  const refreshSidebar = () =>
    void queryClient.invalidateQueries({ queryKey: trpc.agents.list_chats.queryKey() });

  /**
   * This view streamed the latest reply to its end (or stopped it), so its copy is current. When
   * the stream broke instead, the reply carries on server-side and the saved copy takes over.
   */
  const [ownsReply, setOwnsReply] = useState(() => hasPendingMessage(chat.id));
  /** When this view last sent or finished a reply: older fetches never replace its messages. */
  const localAt = useRef(0);

  const { messages, sendMessage, setMessages, status, stop, error, regenerate } =
    useChat<AgentUIMessage>({
      id: chat.id,
      messages: data.messages,
      transport,
      onFinish: ({ isError, isDisconnect }) => {
        localAt.current = Date.now();
        if (isError || isDisconnect) setOwnsReply(false);
        refreshSidebar();
        // Title + streaming flag land with the save; pick up the fresh chat state.
        void queryClient.invalidateQueries({
          queryKey: trpc.agents.get_chat.queryKey({ id: chat.id })
        });
        // The title is saved as the stream closes; pick it up a moment later too.
        setTimeout(refreshSidebar, 1_500);
      }
    });

  const busy = status === 'submitted' || status === 'streaming';
  /** A reply this view isn't streaming is still running on the server (reload, other tab…). */
  const backgroundReply = !busy && !!chat.streaming && !ownsReply;
  const replying = busy || backgroundReply;

  const markSent = () => {
    localAt.current = Date.now();
    setOwnsReply(true);
  };

  useEffect(() => {
    const pending = takePendingMessage(chat.id);
    if (pending) {
      localAt.current = Date.now();
      void sendMessage({ parts: toUserParts(pending) }, { body: { model } });
    }
  }, [chat.id, model, sendMessage]);

  const sendNow = (message: ComposerMessage) => {
    markSent();
    void sendMessage({ parts: toUserParts(message) }, { body: { model } });
  };

  const queue = useMessageQueue({ idle: !replying, status, send: sendNow });
  const composerRef = useRef<ComposerHandle>(null);

  /** Composer / suggestion send: straight out when idle, queued while the agent works. */
  const send = (message: ComposerMessage) => {
    if (replying) return queue.enqueue(message);
    queue.resume();
    sendNow(message);
  };

  const stopOnServer = useMutation(trpc.agents.stop_reply.mutationOptions());

  /** Stop button / Send now: the reply runs on the server, so it is stopped there. */
  const stopReply = async () => {
    queue.pause();
    stopOnServer.mutate({ id: chat.id });
    await stop();
  };

  /** Interrupt the current reply and send a queued message in its place. */
  const sendQueuedNow = async (id: string) => {
    const message = queue.take(id);
    if (!message) return;
    if (replying) await stopReply();
    queue.resume();
    sendNow(message);
  };

  const editQueued = (id: string) => {
    const message = queue.take(id);
    if (message) composerRef.current?.restore(message);
  };

  // The saved conversation moved on without this view streaming it: a reply running server-side
  // after a reload, tab switch or dropped connection (saved after every step), or one that
  // finished elsewhere. Adopt it unless it is older than what this view already shows.
  useEffect(() => {
    if (busy || fetchedAt <= localAt.current) return;
    // Our own reply is still being saved: the stored copy may be a step behind.
    if (data.chat.streaming && ownsReply) return;
    if (conversationKey(data.messages) === conversationKey(messages)) return;
    setMessages(data.messages);
  }, [busy, fetchedAt, data.chat.streaming, data.messages, ownsReply, messages, setMessages]);

  const empty = messages.length === 0 && !busy;

  return (
    <AgentChatProvider value={{ chatId: chat.id, agentKind: chat.agent_kind, replying }}>
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
          <MobileHistoryButton />
          <AgentKindIcon kind={chat.agent_kind} size="md" />
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {chat.title || 'New chat'}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {AGENT_KIND_META[chat.agent_kind].label}
            </span>
          </h1>
          <ChatCost messages={messages} />
          <Button variant="outline" size="sm" onClick={() => setContextOpen(true)}>
            <LibraryBigIcon />
            Context
          </Button>
        </header>
        <BackgroundReplyNotice show={backgroundReply} />

        <div className="relative min-h-0 flex-1">
          <TimelineSwitch
            empty={empty}
            messages={messages}
            busy={busy}
            replying={replying}
            status={status}
            error={error}
            agentKind={chat.agent_kind}
            onSend={send}
            onRetry={() => {
              queue.resume();
              markSent();
              void regenerate({ body: { model } });
            }}
          />
        </div>

        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-4 pb-4">
          <QueuedMessages
            queue={queue.queue}
            paused={queue.paused && !replying}
            onEdit={editQueued}
            onSendNow={(id) => void sendQueuedNow(id)}
            onRemove={queue.remove}
          />
          <ComposerBar
            composerRef={composerRef}
            replying={replying}
            isCreator={isCreator}
            model={model}
            onSend={send}
            onStop={() => void stopReply()}
            onModelChange={setModel}
          />
        </div>
      </div>

      <ContextDialog open={contextOpen} onOpenChange={setContextOpen} agentKind={chat.agent_kind} />
    </AgentChatProvider>
  );
}
