'use client';

import { useCallback, useRef, useState, type PointerEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import { IoMdArrowRoundBack } from 'react-icons/io';
import { Provider as JotaiProvider } from 'jotai';
import { BotIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useTRPC } from '~/api/client';
import AddEditTextDataWrapper, {
  type text_data_type
} from '~/components/pages/gesture_add_edit/AddEditTextGesture';
import {
  GestureAgentPanel,
  type AgentPanelView
} from '~/components/pages/agents/gesture_hub/GestureAgentPanel';
import { useRefreshGesture } from '~/components/pages/agents/gesture_hub/use_refresh_gesture';
import { Button } from '~/components/ui/button';
import { Drawer, DrawerContent, DrawerTitle } from '~/components/ui/drawer';
import { useMediaQuery } from '~/hooks/use_media_query';
import { useStoredValue } from '~/hooks/use_stored_value';

const WIDTH_KEY = 'gesture_agent_panel_width';
const MIN_WIDTH = 360;
const MAX_WIDTH = 900;
const DEFAULT_WIDTH = 480;

const clampWidth = (width: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)));

/** The docked panel's width: dragged by its left edge, remembered per browser. */
function usePanelWidth() {
  const [stored, store] = useStoredValue(WIDTH_KEY);
  /** The width while dragging (stored when the drag ends) */
  const [dragged, setDragged] = useState<number | null>(null);
  const width = dragged ?? (Number(stored) ? clampWidth(Number(stored)) : DEFAULT_WIDTH);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: width };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setDragged(clampWidth(drag.current.startWidth + drag.current.startX - event.clientX));
  };
  const onPointerUp = () => {
    drag.current = null;
    if (dragged !== null) store(String(dragged));
    setDragged(null);
  };
  return { width, handle: { onPointerDown, onPointerMove, onPointerUp } };
}

export default function GestureEditClient({
  id,
  text_data,
  agent
}: {
  id: number;
  text_data: text_data_type & { id: number; uuid: string };
  /** The agent panel's view (from the URL), or closed */
  agent: AgentPanelView | undefined;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const navigate = useNavigate();
  const refreshGesture = useRefreshGesture();
  const docked = useMediaQuery('(min-width: 1024px)');
  const { width, handle } = usePanelWidth();
  const dirty = useRef(false);
  const onDirtyChange = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);
  const chats_q = useQuery(trpc.agents.chats_for_gesture.queryOptions({ gesture_id: id }));

  const setAgent = (next: AgentPanelView | undefined) =>
    void navigate({
      to: '/gestures/edit/$id',
      params: { id: String(id) },
      search: next ? { agent: next } : {},
      replace: true
    });

  /** Saved from the panel (a proposal applied, a version restored): reload the editor with it. */
  const onPanelSave = (gestureId: number) => {
    if (gestureId !== id) return;
    if (dirty.current) {
      toast.warning(
        'A new version was saved from the agent panel. The editor still has your unsaved changes.',
        {
          duration: 20_000,
          action: { label: 'Load the new version', onClick: () => void router.invalidate() }
        }
      );
      return;
    }
    void router.invalidate();
  };

  const panel = agent ? (
    <GestureAgentPanel
      gestureId={id}
      view={agent}
      onViewChange={setAgent}
      onClose={() => setAgent(undefined)}
      onGestureSaved={onPanelSave}
    />
  ) : null;

  const editor = (
    <div className="pb-28">
      <div className="my-2 mb-4 flex items-center gap-2 px-2">
        <Link to="/gestures" className="flex flex-1 items-center gap-1 text-lg font-semibold">
          <IoMdArrowRoundBack className="inline-block text-xl" />
          Text Gesture List
        </Link>
        {agent ? null : (
          <Button variant="outline" size="sm" onClick={() => setAgent('list')}>
            <BotIcon />
            Agents
            {chats_q.data?.length ? (
              <span className="rounded bg-muted px-1 text-xs">{chats_q.data.length}</span>
            ) : null}
          </Button>
        )}
      </div>

      {/* A new saved version (loaded after a save in the panel) starts a fresh editor. */}
      <JotaiProvider key={`edit_akdhara_page-${id}-${text_data.revision}`}>
        <AddEditTextDataWrapper
          text_data={text_data}
          onDirtyChange={onDirtyChange}
          onSaved={refreshGesture}
        />
      </JotaiProvider>
    </div>
  );

  if (!agent) return editor;

  if (!docked) {
    return (
      <>
        {editor}
        <Drawer direction="right" open onOpenChange={(open) => !open && setAgent(undefined)}>
          <DrawerContent className="h-dvh w-full p-0 sm:max-w-lg">
            <DrawerTitle className="sr-only">Agents</DrawerTitle>
            {panel}
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  // Docked: break out of the page container so the editor and the panel share the viewport.
  return (
    <div className="relative left-1/2 flex w-screen -translate-x-1/2 items-start">
      <div className="min-w-0 flex-1 px-4">{editor}</div>
      <aside
        className="sticky top-0 flex h-dvh shrink-0 border-l border-border/70 bg-background"
        style={{ width }}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the agent panel"
          className="w-1.5 shrink-0 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-primary/30"
          {...handle}
        />
        <div className="min-w-0 flex-1">{panel}</div>
      </aside>
    </div>
  );
}
