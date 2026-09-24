import { Cause } from 'effect';
import { describe, expect, it } from 'vitest';
import { DatabaseError, NotFoundError, UnauthorizedError } from './errors';
import {
  contextFromRequest,
  describeCapture,
  isPosthogServerEnabled,
  prettyFailureError
} from './posthog_error';

describe('posthog effect exceptions', () => {
  it('stays disabled outside a production server build', () => {
    expect(isPosthogServerEnabled()).toBe(false);
  });

  it('keeps the nested cause and attaches the browser session id', () => {
    const cause = Cause.fail(
      DatabaseError.make({
        operation: 'insert_audio_asset',
        cause: new Error('connection reset')
      })
    );
    const error = prettyFailureError(cause);
    const request = new Request('https://akshara.example/api/trpc/lesson.add', {
      method: 'POST',
      headers: {
        'x-posthog-session-id': 'sess_1',
        'x-posthog-distinct-id': 'distinct_from_browser',
        cookie: 'better-auth.session=secret-cookie'
      }
    });

    expect(error.message).toBe('DatabaseError: insert_audio_asset: connection reset');
    expect(error.cause).toBeInstanceOf(Error);
    if (error.cause instanceof Error) {
      expect(error.cause.message).toBe('connection reset');
    }

    const plan = describeCapture(cause, error, 'trpc', contextFromRequest(request, 'user_123'));
    expect(plan?.distinctId).toBe('distinct_from_browser');
    expect(plan?.properties.$session_id).toBe('sess_1');
    expect(plan?.properties.effect_tag).toBe('DatabaseError');
    expect(plan?.properties.http_status).toBe(500);
    expect(plan?.properties.method).toBe('POST');
    expect(plan?.properties.pathname).toBe('/api/trpc/lesson.add');
    expect(plan?.properties.effect_cause).toContain('connection reset');
    expect(JSON.parse(plan?.properties.effect_fields ?? '{}')).toMatchObject({
      operation: 'insert_audio_asset',
      causeMessage: 'connection reset'
    });
    expect(JSON.stringify(plan?.properties)).not.toContain('secret-cookie');
  });

  it('falls back to the authenticated user id when the distinct id header is missing', () => {
    const cause = Cause.fail(
      DatabaseError.make({ operation: 'query', cause: new Error('timeout') })
    );
    const error = prettyFailureError(cause);
    const plan = describeCapture(cause, error, 'loader', {
      userId: 'user_123',
      sessionId: 'sess_2'
    });

    expect(plan?.distinctId).toBe('user_123');
    expect(plan?.properties.$session_id).toBe('sess_2');
  });

  it('skips expected domain 4xx failures', () => {
    const notFound = Cause.fail(
      NotFoundError.make({ resource: 'text_lesson', message: 'Text lesson not found' })
    );
    const unauthorized = Cause.fail(UnauthorizedError.make({ message: 'Unauthorized' }));
    expect(describeCapture(notFound, prettyFailureError(notFound), 'trpc', {})).toBeUndefined();
    expect(
      describeCapture(unauthorized, prettyFailureError(unauthorized), 'trpc', {})
    ).toBeUndefined();

    for (const tag of ['BadRequest', 'ValidationError', 'Forbidden', 'ConflictError']) {
      const cause = Cause.fail({ _tag: tag, message: 'nope' });
      expect(describeCapture(cause, prettyFailureError(cause), 'server', {})).toBeUndefined();
    }

    const missing = Cause.fail({ status: 404, message: 'missing page' });
    expect(describeCapture(missing, prettyFailureError(missing), 'server', {})).toBeUndefined();
  });

  it('clips a very long nested cause', () => {
    const cause = Cause.fail(
      DatabaseError.make({ operation: 'query', cause: new Error('y'.repeat(5_000)) })
    );
    const error = prettyFailureError(cause);
    const plan = describeCapture(cause, error, 'trpc', {});
    expect(error.message.endsWith('…')).toBe(true);
    expect(error.message.length).toBeLessThan(5_000);
    expect(plan?.properties.effect_cause.endsWith('…')).toBe(true);
    expect(plan?.properties.effect_cause.length).toBeLessThanOrEqual(4_001);
  });

  it('includes operation, key, provider, batch id, and resource fields', () => {
    const cause = Cause.fail({
      _tag: 'CacheError',
      operation: 'get',
      key: 'lesson:1',
      provider: 'redis',
      batchId: 'batch_9',
      resource: 'lesson',
      cause: new Error('boom')
    });
    const error = prettyFailureError(cause);
    const plan = describeCapture(cause, error, 'cache.get', {});
    expect(JSON.parse(plan?.properties.effect_fields ?? '{}')).toEqual({
      operation: 'get',
      key: 'lesson:1',
      provider: 'redis',
      batchId: 'batch_9',
      resource: 'lesson',
      causeMessage: 'boom'
    });
  });
});
