import {
  createStartHandler,
  defaultStreamHandler,
  handleStartError,
  type RequestHandler
} from '@tanstack/react-start/server';
import { createServerEntry } from '@tanstack/react-start/server-entry';
import type { Register } from '@tanstack/react-router';
import { runWithRequest } from './effect/request_context';
import { reportThrownError } from './effect/report_server_error';

const startHandler = createStartHandler(defaultStreamHandler);

export type ServerEntry = { fetch: RequestHandler<Register> };

// Providing `RequestHandler` from `@tanstack/react-start/server` keeps the output types off
// `@tanstack/start-server-core`. The PostHog TanStack guide has no server error hook, so this
// entry records process-wide throws the Effect runners do not already send.
export default createServerEntry({
  async fetch(request, opts) {
    return runWithRequest(request, async () => {
      try {
        return await startHandler(request, opts);
      } catch (cause: unknown) {
        await reportThrownError(cause);
        return handleStartError(cause);
      }
    });
  }
});
