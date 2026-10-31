import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ExternalLinkIcon } from 'lucide-react';
import { useTRPC } from '~/api/client';
import { AGENT_KIND_META } from '~/agents/agent_kinds';
import type { AgentModelId } from '~/agents/models';
import { GesturePreview } from '~/components/gesture/GesturePreview';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { cn } from '~/lib/utils';
import { get_script_from_id } from '~/state/lang_list';
import { ChatComposer } from '../chat/ChatComposer';
import { ModelPicker } from '../chat/ModelPicker';
import { useGlyphBackground } from '../gesture/use_glyph_background';
import { MobileHistoryButton } from '../sidebar/AgentsSidebar';
import { useStartChat } from '../use_start_chat';
import { GestureChats } from './GestureChats';
import { GestureHistory } from './GestureHistory';
import { AgentNotesEditor, ReviewControls } from './GestureReview';
import { ReviewBadge } from './ReviewBadge';

function Section({
  title,
  children,
  className
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn('flex flex-col gap-2 rounded-xl border border-border/70 p-3', className)}
    >
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Start a chat focused on this gesture from its hub (opens on the chat's own page). */
export function NewFocusedChat({
  gestureId,
  onCreated
}: {
  gestureId: number;
  onCreated: (chatId: string) => void;
}) {
  const [model, setModel] = useState<AgentModelId>(AGENT_KIND_META.gesture_creator.defaultModel);
  const { start, pending } = useStartChat(onCreated);
  return (
    <ChatComposer
      busy={pending}
      mentions={false}
      onSend={(message) =>
        start({ agentKind: 'gesture_creator', model, focusGestureId: gestureId, message })
      }
      placeholder="New focused chat: say how to draw it, or “Trace it”…"
      toolbar={<ModelPicker value={model} onChange={setModel} />}
    />
  );
}

/**
 * Everything about one gesture in one place: its saved strokes, review state and notes, the
 * same akṣara in other scripts, every chat about it, and its version history.
 */
export function GestureHub({ gestureId }: { gestureId: number }) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const hub_q = useQuery(
    trpc.agents.gesture_hub.queryOptions(
      { gesture_id: gestureId },
      {
        retry: false,
        refetchInterval: (query) =>
          query.state.data?.chats.some((c) => c.streaming) ? 3000 : false
      }
    )
  );
  const gesture = hub_q.data?.gesture;
  const background = useGlyphBackground(gesture ?? null);

  if (hub_q.isError) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        {hub_q.error.message}
      </div>
    );
  }
  if (!hub_q.data || !gesture) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  const { siblings, chats } = hub_q.data;
  const strokes = [...gesture.gestures]
    .sort((a, b) => a.index - b.index)
    .filter((g) => g.points.length > 0);
  const script = get_script_from_id(gesture.script_id) ?? String(gesture.script_id);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
        <MobileHistoryButton />
        <h1 className="flex min-w-0 flex-1 items-baseline gap-2 truncate">
          <span className="text-xl font-semibold">{gesture.text}</span>
          <span className="text-sm text-muted-foreground">
            {script} #{gesture.id} · v{gesture.revision}
          </span>
        </h1>
        <ReviewBadge status={gesture.review_status} strokes={strokes.length} />
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<a href={`/gestures/edit/${gesture.id}?agent=list`} />}
        >
          Open in editor
          <ExternalLinkIcon />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-5xl gap-3 px-4 py-4 lg:grid-cols-[20rem_1fr]">
          <div className="flex flex-col gap-3">
            <Section title={`Saved · ${strokes.length} strokes`}>
              {strokes.length > 0 ? (
                <GesturePreview
                  gestures={strokes}
                  backgroundSrc={background}
                  inspect={{
                    title: `${gesture.text} — saved v${gesture.revision}`,
                    label: 'Saved'
                  }}
                />
              ) : (
                <p className="flex aspect-square items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                  No strokes yet
                </p>
              )}
            </Section>
            <Section title="Review">
              <ReviewControls
                key={`${gesture.review_status}|${gesture.review_note}`}
                strokes={strokes.length}
                gestureId={gesture.id}
                status={gesture.review_status}
                note={gesture.review_note}
              />
            </Section>
            <Section title="Notes for the agent">
              <AgentNotesEditor gestureId={gesture.id} notes={gesture.agent_notes} />
            </Section>
            {siblings.length > 0 ? (
              <Section title="Other scripts">
                <ul className="flex flex-col gap-0.5">
                  {siblings.map((sibling) => (
                    <li key={sibling.id}>
                      <Link
                        to="/admin/agents/gestures/$gestureId"
                        params={{ gestureId: String(sibling.id) }}
                        className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm no-underline hover:bg-muted/60"
                      >
                        <span className="w-7 text-center text-lg leading-none">{sibling.text}</span>
                        <span className="min-w-0 flex-1 truncate">
                          {get_script_from_id(sibling.script_id) ?? sibling.script_id}
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            {sibling.strokes > 0 ? `${sibling.strokes} strokes` : 'no strokes'}
                          </span>
                        </span>
                        <ReviewBadge status={sibling.review_status} strokes={sibling.strokes} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <Section title="Chats">
              <NewFocusedChat
                gestureId={gesture.id}
                onCreated={(chatId) =>
                  void navigate({ to: '/admin/agents/$chatId', params: { chatId } })
                }
              />
              <GestureChats
                chats={chats}
                renderLink={(chat, content, className) => (
                  <Link
                    to="/admin/agents/$chatId"
                    params={{ chatId: chat.id }}
                    className={className}
                  >
                    {content}
                  </Link>
                )}
              />
            </Section>
            <Section title="History">
              <GestureHistory gestureId={gesture.id} text={gesture.text} />
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
