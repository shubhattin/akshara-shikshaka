import { Cause, Predicate } from 'effect';
import { getServerUserSession$ } from '~/lib/get_auth_from_cookie';
import { getPostHogClient } from '~/lib/posthog-server';
import { currentRequest } from './request_context';
import {
  contextFromRequest,
  describeCapture,
  isExpectedFailureValue,
  isPosthogServerEnabled,
  markReported,
  prettyFailureError,
  wasReported
} from './posthog_error';

const authenticatedUserId = async (): Promise<string | undefined> => {
  try {
    const session = await getServerUserSession$();
    const userId = session?.user?.id;
    if (!Predicate.isString(userId) || userId.length === 0) return undefined;
    return userId;
  } catch (cause: unknown) {
    console.error('[posthog] session lookup failed', cause);
    return undefined;
  }
};

export const deliverPrepared = async (
  effectCause: Cause.Cause<unknown>,
  source: string,
  error: Error
): Promise<boolean> => {
  const request = currentRequest();
  const requestContext = request ? contextFromRequest(request) : undefined;
  const userId = requestContext?.headerDistinctId ? undefined : await authenticatedUserId();
  const plan = describeCapture(effectCause, error, source, {
    headerDistinctId: requestContext?.headerDistinctId,
    sessionId: requestContext?.sessionId,
    userId,
    method: requestContext?.method,
    pathname: requestContext?.pathname
  });
  if (!plan) return false;

  const client = getPostHogClient();
  if (!client) return false;

  markReported(plan.error);
  await client.captureExceptionImmediate(plan.error, plan.distinctId, plan.properties);
  return true;
};

/** Process-wide throws that never reached an Effect runner. */
export const reportThrownError = async (cause: unknown): Promise<void> => {
  if (!isPosthogServerEnabled()) return;
  if (wasReported(cause)) return;
  if (isExpectedFailureValue(cause)) return;

  const effectCause = Cause.fail(cause);
  const error = prettyFailureError(effectCause);
  const sent = await deliverPrepared(effectCause, 'server', error);
  if (sent) markReported(cause);
};
