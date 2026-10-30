import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { NewChatPanel } from '~/components/pages/agents/NewChatPanel';

const new_chat_search_schema = z.object({
  /** Start a chat focused on this gesture (from its hub or the editor) */
  focus: z.coerce.number().int().positive().optional()
});

export const Route = createFileRoute('/admin/agents/')({
  validateSearch: new_chat_search_schema,
  component: RouteComponent
});

function RouteComponent() {
  const { focus } = Route.useSearch();
  return <NewChatPanel key={focus ?? 'free'} initialFocusId={focus} />;
}
