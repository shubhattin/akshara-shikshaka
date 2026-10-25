import { Outlet } from '@tanstack/react-router';
import { AgentsSidebar } from './sidebar/AgentsSidebar';

/** App shell below the site header: chat history beside the open chat, filling the viewport. */
export function AgentsLayout() {
  return (
    <div className="-mb-12 flex h-[calc(100dvh-4.5rem)] min-h-0 overflow-hidden rounded-xl border border-border/70 bg-background">
      <AgentsSidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}
