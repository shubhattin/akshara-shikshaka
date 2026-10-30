import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { CrosshairIcon, MessagesSquareIcon, XIcon } from 'lucide-react';
import { useTRPC } from '~/api/client';
import { AGENT_KIND_META, AGENT_KINDS, type AgentKind } from '~/agents/agent_kinds';
import type { AgentModelId } from '~/agents/models';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { get_script_from_id } from '~/state/lang_list';
import { AGENT_SUGGESTIONS } from './agent_meta';
import { AgentKindIcon } from './AgentKindIcon';
import { ChatComposer } from './chat/ChatComposer';
import { ModelPicker } from './chat/ModelPicker';
import { GesturePicker } from './mentions/GesturePicker';
import { MobileHistoryButton } from './sidebar/AgentsSidebar';
import { useStartChat } from './use_start_chat';

const PLACEHOLDERS = {
  general: 'Ask about gestures, lessons, practice… (@ to mention a gesture)',
  gesture_creator: 'Mention a gesture with @ and say how to draw it…'
} as const satisfies Record<AgentKind, string>;

const FOCUS_SUGGESTIONS = [
  'Trace it',
  'Trace it again from scratch, following the style guide',
  'Trace it slowly, with ease-in-out'
] as const;

const FOCUS_PLACEHOLDER = 'Say how to draw it, or just send “Trace it”…';

type ChatMode = 'free' | 'focused';

/** The gesture a focused chat will work on, with a way to pick another. */
function FocusedGestureCard({ gestureId, onClear }: { gestureId: number; onClear: () => void }) {
  const trpc = useTRPC();
  const gesture_q = useQuery(trpc.agents.get_gesture.queryOptions({ id: gestureId }));
  const gesture = gesture_q.data;
  const strokes = gesture?.gestures.filter((g) => g.points.length > 0).length ?? 0;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2.5">
      <span className="w-10 text-center text-3xl leading-none">{gesture?.text ?? '…'}</span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold">
          {gesture ? (get_script_from_id(gesture.script_id) ?? gesture.script_id) : 'Loading…'}{' '}
          <span className="font-normal text-muted-foreground">#{gestureId}</span>
        </span>
        <span className="text-xs text-muted-foreground">
          {gesture
            ? strokes > 0
              ? `${strokes} saved strokes · v${gesture.revision}`
              : 'No strokes yet'
            : ''}
        </span>
      </div>
      <Button variant="ghost" size="icon-sm" aria-label="Pick another gesture" onClick={onClear}>
        <XIcon />
      </Button>
    </div>
  );
}

export function NewChatPanel({ initialFocusId }: { initialFocusId?: number }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<ChatMode>(initialFocusId === undefined ? 'free' : 'focused');
  const [focusId, setFocusId] = useState<number | null>(initialFocusId ?? null);
  const [freeKind, setAgentKind] = useState<AgentKind>('gesture_creator');
  const agentKind: AgentKind = mode === 'focused' ? 'gesture_creator' : freeKind;
  const [pickedModel, setPickedModel] = useState<AgentModelId | null>(null);
  const model = pickedModel ?? AGENT_KIND_META[agentKind].defaultModel;

  const { start: startChat, pending } = useStartChat(
    (chatId) => void navigate({ to: '/admin/agents/$chatId', params: { chatId } })
  );
  const focusReady = mode === 'free' || focusId !== null;
  const start = (message: Parameters<typeof startChat>[0]['message']) => {
    if (!focusReady) return;
    startChat({
      agentKind,
      model,
      focusGestureId: mode === 'focused' ? (focusId ?? undefined) : undefined,
      message
    });
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

          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Chat mode">
            {(
              [
                {
                  value: 'free',
                  label: 'Free chat',
                  hint: 'Any gestures, any scripts, via @ mentions',
                  Icon: MessagesSquareIcon
                },
                {
                  value: 'focused',
                  label: 'Focus on one gesture',
                  hint: 'One gesture of one script; grouped under it',
                  Icon: CrosshairIcon
                }
              ] as const
            ).map(({ value, label, hint, Icon }) => {
              const selected = mode === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    setMode(value);
                    setPickedModel(null);
                  }}
                  className={cn(
                    'flex items-start gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors',
                    selected
                      ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                      : 'border-border bg-card hover:border-foreground/20 hover:bg-muted/40'
                  )}
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold">{label}</span>
                    <span className="text-xs text-muted-foreground">{hint}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {mode === 'focused' ? (
            focusId === null ? (
              <GesturePicker onPick={(gesture) => setFocusId(gesture.id)} />
            ) : (
              <FocusedGestureCard gestureId={focusId} onClear={() => setFocusId(null)} />
            )
          ) : null}

          {mode === 'free' ? (
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
          ) : null}

          {agentKind === 'gesture_creator' ? (
            <p className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              The Gesture Creator works on the server: you can leave or reload the page and come
              back to it. Cancel an attempt at any time; nothing is saved until you apply a
              proposal.
            </p>
          ) : null}

          {focusReady ? (
            <ChatComposer
              key={mode}
              busy={pending}
              onSend={start}
              mentions={mode === 'free'}
              placeholder={mode === 'focused' ? FOCUS_PLACEHOLDER : PLACEHOLDERS[agentKind]}
              toolbar={<ModelPicker value={model} onChange={setPickedModel} />}
              autoFocus={mode === 'free'}
            />
          ) : null}

          <div className="flex flex-wrap justify-center gap-2">
            {(mode === 'focused'
              ? focusId === null
                ? []
                : FOCUS_SUGGESTIONS
              : AGENT_SUGGESTIONS[agentKind]
            ).map((suggestion) => (
              <Button
                key={suggestion}
                variant="outline"
                size="sm"
                disabled={pending}
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
