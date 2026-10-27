import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { useTRPC } from '~/api/client';
import { AGENT_KIND_META, AGENT_KINDS, type AgentKind } from '~/agents/agent_kinds';
import type { AgentModelId } from '~/agents/models';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { AGENT_SUGGESTIONS } from './agent_meta';
import { AgentKindIcon } from './AgentKindIcon';
import { ChatComposer, type ComposerMessage } from './chat/ChatComposer';
import { ModelPicker } from './chat/ModelPicker';
import { setPendingMessage } from './pending_message';
import { MobileHistoryButton } from './sidebar/AgentsSidebar';

const PLACEHOLDERS = {
  general: 'Ask about gestures, lessons, practice… (@ to mention a gesture)',
  gesture_creator: 'Mention a gesture with @ and say how to draw it…'
} as const satisfies Record<AgentKind, string>;

/** Pick an agent and a model, then send the first message; the reply streams on the chat's own URL. */
export function NewChatPanel() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [agentKind, setAgentKind] = useState<AgentKind>('general');
  const [pickedModel, setPickedModel] = useState<AgentModelId | null>(null);
  const model = pickedModel ?? AGENT_KIND_META[agentKind].defaultModel;

  const create_mut = useMutation(
    trpc.agents.create_chat.mutationOptions({
      onSuccess: (chat) => {
        void queryClient.invalidateQueries({ queryKey: trpc.agents.list_chats.queryKey() });
        void navigate({ to: '/admin/agents/$chatId', params: { chatId: chat.id } });
      },
      onError: (error) => toast.error(error.message)
    })
  );

  const start = (message: ComposerMessage) => {
    const id = nanoid(16);
    setPendingMessage(id, message);
    create_mut.mutate({ id, model, agent_kind: agentKind });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 px-3 py-2 md:hidden">
        <MobileHistoryButton />
        <span className="text-sm font-semibold">New chat</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 md:py-14">
          <div className="flex flex-col gap-1 text-center">
            <h1 className="text-2xl font-black tracking-tight">Agents</h1>
            <p className="text-sm text-muted-foreground">
              Internal AI helpers for Akshara Shikshaka.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Agent">
            {AGENT_KINDS.map((kind) => {
              const selected = agentKind === kind;
              return (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    setAgentKind(kind);
                    setPickedModel(null);
                  }}
                  className={cn(
                    'flex flex-col gap-1.5 rounded-xl border p-4 text-left transition-colors',
                    selected
                      ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                      : 'border-border bg-card hover:border-foreground/20 hover:bg-muted/40'
                  )}
                >
                  <span className="flex items-center gap-2.5 font-semibold">
                    <AgentKindIcon kind={kind} size="lg" />
                    {AGENT_KIND_META[kind].label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {AGENT_KIND_META[kind].description}
                  </span>
                </button>
              );
            })}
          </div>

          {agentKind === 'gesture_creator' ? (
            <p className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              The Gesture Creator works on the server: you can leave or reload the page and come
              back to it. Cancel an attempt at any time; nothing is saved until you apply a
              proposal.
            </p>
          ) : null}

          <ChatComposer
            busy={create_mut.isPending}
            onSend={start}
            placeholder={PLACEHOLDERS[agentKind]}
            toolbar={<ModelPicker value={model} onChange={setPickedModel} />}
            autoFocus
          />

          <div className="flex flex-wrap justify-center gap-2">
            {AGENT_SUGGESTIONS[agentKind].map((suggestion) => (
              <Button
                key={suggestion}
                variant="outline"
                size="sm"
                disabled={create_mut.isPending}
                className="h-auto rounded-full py-1.5 whitespace-normal"
                onClick={() => start({ text: suggestion, refs: [] })}
              >
                {suggestion}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
