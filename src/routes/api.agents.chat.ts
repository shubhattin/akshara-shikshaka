import { createFileRoute } from '@tanstack/react-router';
import { createUIMessageStreamResponse } from 'ai';
import { Effect } from 'effect';
import { z } from 'zod';
import { agent_model_id_schema } from '~/agents/models';
import { startAgentTurn } from '~/agents/server/run_turn';
import { enqueueBackground } from '~/effect/background';
import { runRouteEffect } from '~/effect/run';
import { getServerUserSession$ } from '~/lib/get_auth_from_cookie';
import { isSameOriginRequest } from '~/lib/same_origin';

const body_schema = z.object({
  id: z.string().min(1).max(64),
  /** The new user message; history is loaded from the database. */
  message: z.object({ id: z.string().min(1), role: z.literal('user') }).passthrough(),
  model: agent_model_id_schema
});

async function handleChat(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return new Response('Cross-site request rejected', { status: 403 });
  }
  const session = await getServerUserSession$();
  const user = session?.user;
  if (user?.role !== 'admin') return new Response('Forbidden', { status: 403 });

  const parsed = body_schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400 });
  const { id, model, message } = parsed.data;

  return runRouteEffect(
    Effect.gen(function* () {
      const turn = yield* startAgentTurn({ chatId: id, message, model, withClientStream: true });
      // The reply finishes and is saved even after the response (and the tab) is gone.
      yield* enqueueBackground(() => turn.done);
      return createUIMessageStreamResponse({ stream: turn.toClient! });
    }),
    { onSuccess: (response) => response }
  );
}

export const Route = createFileRoute('/api/agents/chat')({
  server: {
    handlers: {
      POST: ({ request }) => handleChat(request)
    }
  }
});
