import {
  createStartHandler,
  defaultStreamHandler,
  type RequestHandler
} from '@tanstack/react-start/server';
import type { Register } from '@tanstack/react-router';
import { runWithRequest } from './effect/request_context';
import { reportThrownError } from './effect/report_server_error';

const startFetch = createStartHandler(defaultStreamHandler);

// Providing `RequestHandler` from `@tanstack/react-start/server` keeps the output types off
// `@tanstack/start-server-core`. The PostHog TanStack guide has no server error hook, so this
// entry records process-wide throws the Effect runners do not already send.
const fetch: RequestHandler<Register> = (request, requestOpts) =>
  runWithRequest(request, async () => {
    try {
      return await startFetch(request, requestOpts);
    } catch (cause: unknown) {
      await reportThrownError(cause);
      throw cause;
    }
  });

export type ServerEntry = { fetch: RequestHandler<Register> };

export function createServerEntry(entry: ServerEntry): ServerEntry {
  return {
    async fetch(...args) {
      return await entry.fetch(...args);
    }
  };
}

export default createServerEntry({ fetch });
