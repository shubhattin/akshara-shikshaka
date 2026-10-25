import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { useQueryClient } from '@tanstack/react-query';
import type { inferRouterOutputs } from '@trpc/server';
import { DefaultChatTransport } from 'ai';
import { AlertCircleIcon, BotIcon, LibraryBigIcon, RotateCcwIcon } from 'lucide-react';
import { useTRPC } from '~/api/client';
import type { AppRouter } from '~/api/trpc_router';
import type { AgentModelId } from '~/agents/models';
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
import { ContextDialog } from '../context/ContextDialog';
import { takePendingMessage } from '../pending_message';
import { MobileHistoryButton } from '../sidebar/AgentsSidebar';
import { AssistantMessage, ThinkingLine, UserMessage } from './AgentMessage';
import { ChatComposer } from './ChatComposer';
import { ModelPicker } from './ModelPicker';

export type AgentChatData = inferRouterOutputs<AppRouter>['agents']['get_chat'];

export function AgentChat({ data }: { data: AgentChatData }) {
  const { chat } = data;
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [model, setModel] = useState<AgentModelId>(chat.model);
  const [contextOpen, setContextOpen] = useState(false);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<AgentUIMessage>({
        api: '/api/agents/chat',
        // Only the new message (plus the per-request model): history is loaded server-side.
        prepareSendMessagesRequest: ({ id, messages, body }) => ({
          body: { ...body, id, message: messages.at(-1) }
        })
      }),
    []
  );

  const refreshSidebar = () =>
    void queryClient.invalidateQueries({ queryKey: trpc.agents.list_chats.queryKey() });

  const { messages, sendMessage, setMessages, status, stop, error, regenerate } =
    useChat<AgentUIMessage>({
      id: chat.id,
      messages: data.messages,
      transport,
      onFinish: () => {
        refreshSidebar();
        // Title + streaming flag land with the save; pick up the fresh chat state.
        void queryClient.invalidateQueries({
          queryKey: trpc.agents.get_chat.queryKey({ id: chat.id })
        });
        // The title is saved as the stream closes; pick it up a moment later too.
        setTimeout(refreshSidebar, 1_500);
      }
    });

  // Set once this view sends: from then on the local conversation wins over refetches.
  const sentLocally = useRef(false);

  useEffect(() => {
    const pending = takePendingMessage(chat.id);
    if (pending) {
      sentLocally.current = true;
      void sendMessage({ text: pending }, { body: { model: chat.model } });
    }
  }, [chat.id, chat.model, sendMessage]);

  const send = (text: string) => {
    sentLocally.current = true;
    void sendMessage({ text }, { body: { model } });
  };

  const busy = status === 'submitted' || status === 'streaming';

  // A reply generated elsewhere (background stream, another tab) lands in the DB while this
  // view is idle: adopt it so refresh / back-navigation shows the finished turn.
  useEffect(() => {
    if (
      !busy &&
      !sentLocally.current &&
      !data.chat.streaming &&
      data.messages.length > messages.length
    ) {
      setMessages(data.messages);
    }
  }, [busy, data.chat.streaming, data.messages, messages.length, setMessages]);

  // Warn before dropping an in-flight reply with a reload or tab close.
  useEffect(() => {
    if (!busy) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [busy]);

  const lastMessage = messages.at(-1);

  return (
    <>
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
          <MobileHistoryButton />
          <BotIcon className="size-4 shrink-0 text-primary" />
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {chat.title || 'New chat'}
          </h1>
          <Button variant="outline" size="sm" onClick={() => setContextOpen(true)}>
            <LibraryBigIcon />
            Context
          </Button>
        </header>
        {!busy && chat.streaming ? (
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
                <p className="text-lg font-semibold">Admin agent</p>
                <p className="text-sm text-muted-foreground">
                  Queries the database, searches the web and shows gestures inline.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {AGENT_SUGGESTIONS.map((suggestion) => (
                  <Button
                    key={suggestion}
                    variant="outline"
                    size="sm"
                    className="h-auto rounded-full py-1.5 whitespace-normal"
                    onClick={() => send(suggestion)}
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
                            streaming={busy && message === lastMessage}
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
                              onClick={() => void regenerate({ body: { model } })}
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

        <div className="mx-auto w-full max-w-3xl px-4 pb-4">
          <ChatComposer
            busy={busy}
            onStop={() => void stop()}
            onSend={send}
            placeholder="Ask about gestures, lessons, practice…"
            toolbar={<ModelPicker value={model} onChange={setModel} disabled={busy} />}
            autoFocus
          />
        </div>
      </div>

      <ContextDialog open={contextOpen} onOpenChange={setContextOpen} />
    </>
  );
}
