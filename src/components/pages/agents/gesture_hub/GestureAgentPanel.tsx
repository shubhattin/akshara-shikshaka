import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeftIcon, ExternalLinkIcon, XIcon } from 'lucide-react';
import { useTRPC } from '~/api/client';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { ChatPage } from '../ChatPage';
import { GestureChats } from './GestureChats';
import { NewFocusedChat } from './GestureHub';
import { GestureHistory } from './GestureHistory';
import { AgentNotesEditor, ReviewControls } from './GestureReview';
import { ReviewBadge } from './ReviewBadge';

/** What the panel shows: the chat list, one chat, the history or the review. */
export type AgentPanelView = 'list' | 'history' | 'review' | `chat:${string}`;

export const panelChatId = (view: AgentPanelView) =>
  view.startsWith('chat:') ? view.slice('chat:'.length) : null;

/**
 * The agents beside the gesture editor: this gesture's chats (open one and work with it exactly
 * as on the agents page), its version history and its review. Saves made here reload the
 * editor (`onGestureSaved`); saves made in the editor refresh the panel.
 */
export function GestureAgentPanel({
  gestureId,
  view,
  onViewChange,
  onClose,
  onGestureSaved
}: {
  gestureId: number;
  view: AgentPanelView;
  onViewChange: (view: AgentPanelView) => void;
  onClose: () => void;
  onGestureSaved: (gestureId: number) => void;
}) {
  const trpc = useTRPC();
  const chatId = panelChatId(view);
  const hub_q = useQuery(
    trpc.agents.gesture_hub.queryOptions(
      { gesture_id: gestureId },
      {
        refetchInterval: (query) =>
          query.state.data?.chats.some((c) => c.streaming) ? 3000 : false
      }
    )
  );
  const gesture = hub_q.data?.gesture;

  if (chatId) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <ChatPage
          key={chatId}
          chatId={chatId}
          variant="panel"
          onGestureSaved={onGestureSaved}
          headerStart={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Back to this gesture’s chats"
              onClick={() => onViewChange('list')}
            >
              <ArrowLeftIcon />
            </Button>
          }
        />
      </div>
    );
  }

  const tab = view === 'history' || view === 'review' ? view : 'list';
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
          Agents
          {gesture ? (
            <span className="ml-1.5 font-normal text-muted-foreground">
              {gesture.text} · v{gesture.revision}
            </span>
          ) : null}
        </h2>
        <ReviewBadge
          status={gesture?.review_status ?? null}
          strokes={gesture?.gestures.filter((g) => g.points.length > 0).length ?? 0}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          nativeButton={false}
          aria-label="Open the gesture hub"
          title="Open the gesture hub"
          render={
            <Link
              to="/admin/agents/gestures/$gestureId"
              params={{ gestureId: String(gestureId) }}
              target="_blank"
            />
          }
        >
          <ExternalLinkIcon />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Close the panel" onClick={onClose}>
          <XIcon />
        </Button>
      </header>
      <Tabs
        value={tab}
        onValueChange={(value) =>
          onViewChange(value === 'history' || value === 'review' ? value : 'list')
        }
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="mx-3 mt-2 w-[calc(100%-1.5rem)]">
          <TabsTrigger value="list">Chats</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="review">Review</TabsTrigger>
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {!hub_q.data || !gesture ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              <TabsContent value="list" className="flex flex-col gap-3">
                <NewFocusedChat
                  gestureId={gestureId}
                  onCreated={(id) => onViewChange(`chat:${id}`)}
                />
                <GestureChats
                  chats={hub_q.data.chats}
                  renderLink={(chat, content, className) => (
                    <button
                      type="button"
                      className={className}
                      onClick={() => onViewChange(`chat:${chat.id}`)}
                    >
                      {content}
                    </button>
                  )}
                />
              </TabsContent>
              <TabsContent value="history">
                <GestureHistory
                  gestureId={gestureId}
                  text={gesture.text}
                  externalLinks
                  onRestored={onGestureSaved}
                />
              </TabsContent>
              <TabsContent value="review" className="flex flex-col gap-4">
                <ReviewControls
                  key={`${gesture.review_status}|${gesture.review_note}`}
                  strokes={gesture.gestures.filter((g) => g.points.length > 0).length}
                  gestureId={gestureId}
                  status={gesture.review_status}
                  note={gesture.review_note}
                />
                <AgentNotesEditor gestureId={gestureId} notes={gesture.agent_notes} />
              </TabsContent>
            </>
          )}
        </div>
      </Tabs>
    </div>
  );
}
