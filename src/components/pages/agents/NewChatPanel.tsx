import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { nanoid } from 'nanoid';
import { BotIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useTRPC } from '~/api/client';
import { AGENT_DEFAULT_MODEL, type AgentModelId } from '~/agents/models';
import { Button } from '~/components/ui/button';
import { AGENT_SUGGESTIONS } from './agent_meta';
import { ChatComposer } from './chat/ChatComposer';
import { ModelPicker } from './chat/ModelPicker';
import { setPendingMessage } from './pending_message';
import { MobileHistoryButton } from './sidebar/AgentsSidebar';

/** Pick a model and send the first message; the reply streams on the chat's own URL. */
export function NewChatPanel() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [model, setModel] = useState<AgentModelId>(AGENT_DEFAULT_MODEL);

  const create_mut = useMutation(
    trpc.agents.create_chat.mutationOptions({
      onSuccess: (chat) => {
        void queryClient.invalidateQueries({ queryKey: trpc.agents.list_chats.queryKey() });
        void navigate({ to: '/admin/agents/$chatId', params: { chatId: chat.id } });
      },
      onError: (error) => toast.error(error.message)
    })
  );

  const start = (text: string) => {
    const id = nanoid(16);
    setPendingMessage(id, text);
    create_mut.mutate({ id, model });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 px-3 py-2 md:hidden">
        <MobileHistoryButton />
        <span className="text-sm font-semibold">New chat</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 md:py-14">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <BotIcon className="size-6" />
            </span>
            <h1 className="text-2xl font-black tracking-tight">Admin agent</h1>
            <p className="text-sm text-muted-foreground">
              Ask about gestures, lessons and practice. It reads the database, searches the web and
              shows gestures inline — it never changes anything.
            </p>
          </div>

          <ChatComposer
            busy={create_mut.isPending}
            onSend={start}
            placeholder="Ask about gestures, lessons, practice…"
            toolbar={<ModelPicker value={model} onChange={setModel} />}
            autoFocus
          />

          <div className="flex flex-wrap justify-center gap-2">
            {AGENT_SUGGESTIONS.map((suggestion) => (
              <Button
                key={suggestion}
                variant="outline"
                size="sm"
                disabled={create_mut.isPending}
                className="h-auto rounded-full py-1.5 whitespace-normal"
                onClick={() => start(suggestion)}
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
