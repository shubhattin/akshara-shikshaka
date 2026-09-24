import { Cause, Effect, Option, Predicate } from 'effect';

const CAUSE_TEXT_LIMIT = 4_000;

const DISTINCT_ID_HEADER = 'x-posthog-distinct-id';
const SESSION_ID_HEADER = 'x-posthog-session-id';

const EXPECTED_TAGS = new Set([
  'NotFound',
  'NotFoundError',
  'BadRequest',
  'BadRequestError',
  'Validation',
  'ValidationError',
  'Unauthorized',
  'UnauthorizedError',
  'Forbidden',
  'ForbiddenError',
  'Conflict',
  'ConflictError'
]);

const EXPECTED_TRPC_CODES = new Set([
  'NOT_FOUND',
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'CONFLICT'
]);

const reportedErrors = new WeakSet<object>();

export type CaptureContext = {
  headerDistinctId?: string;
  sessionId?: string;
  userId?: string;
  method?: string;
  pathname?: string;
};

export type CaptureProperties = {
  source: string;
  effect_cause: string;
  effect_tag?: string;
  effect_fields?: string;
  $session_id?: string;
  http_status?: number;
  method?: string;
  pathname?: string;
};

export type CapturePlan = {
  readonly error: Error;
  readonly distinctId: string | undefined;
  readonly properties: CaptureProperties;
};

type EffectFields = {
  operation?: string;
  key?: string;
  provider?: string;
  batchId?: string;
  resource?: string;
  causeMessage?: string;
};

/** Fields copied off a thrown Effect error before they are sent to PostHog. */
type FailureFields = {
  readonly _tag?: unknown;
  readonly operation?: unknown;
  readonly key?: unknown;
  readonly provider?: unknown;
  readonly batchId?: unknown;
  readonly batch_id?: unknown;
  readonly resource?: unknown;
  readonly code?: unknown;
  readonly status?: unknown;
  readonly statusCode?: unknown;
  readonly cause?: unknown;
};

const TAG_STATUS = {
  NotFound: 404,
  NotFoundError: 404,
  BadRequest: 400,
  BadRequestError: 400,
  Validation: 400,
  ValidationError: 400,
  Unauthorized: 401,
  UnauthorizedError: 401,
  Forbidden: 403,
  ForbiddenError: 403,
  Conflict: 409,
  ConflictError: 409,
  DatabaseError: 500,
  RedisError: 500,
  CacheError: 500,
  StorageError: 500,
  AiProviderError: 500,
  ImageProcessingError: 500,
  AuthError: 500,
  ConfigError: 500
} as const;

const isKnownTag = (tag: string): tag is keyof typeof TAG_STATUS => Object.hasOwn(TAG_STATUS, tag);

const clip = (text: string): string =>
  text.length <= CAUSE_TEXT_LIMIT ? text : `${text.slice(0, CAUSE_TEXT_LIMIT)}…`;

const nonEmptyString = (cause: unknown): string | undefined => {
  if (!Predicate.isString(cause)) return undefined;
  const trimmed = cause.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const toFailureFields = (cause: unknown): FailureFields | undefined => {
  if (!Predicate.isObject(cause)) return undefined;
  return {
    _tag: cause._tag,
    operation: cause.operation,
    key: cause.key,
    provider: cause.provider,
    batchId: cause.batchId,
    batch_id: cause.batch_id,
    resource: cause.resource,
    code: cause.code,
    status: cause.status,
    statusCode: cause.statusCode,
    cause: cause.cause
  };
};

const readString = (
  value: FailureFields,
  key: '_tag' | 'operation' | 'key' | 'provider' | 'batchId' | 'batch_id' | 'resource' | 'code'
): string | undefined => {
  switch (key) {
    case '_tag':
      return nonEmptyString(value._tag);
    case 'operation':
      return nonEmptyString(value.operation);
    case 'key':
      return nonEmptyString(value.key);
    case 'provider':
      return nonEmptyString(value.provider);
    case 'batchId':
      return nonEmptyString(value.batchId);
    case 'batch_id':
      return nonEmptyString(value.batch_id);
    case 'resource':
      return nonEmptyString(value.resource);
    case 'code':
      return nonEmptyString(value.code);
  }
};

const readStatus = (value: FailureFields): number | undefined => {
  if (Predicate.isNumber(value.status)) return value.status;
  if (Predicate.isNumber(value.statusCode)) return value.statusCode;
  return undefined;
};

const nestedCauseMessage = (value: FailureFields): string | undefined => {
  if (!('cause' in value)) return undefined;
  const nested = value.cause;
  if (Predicate.isError(nested) && nested.message.length > 0) return clip(nested.message);
  const asText = nonEmptyString(nested);
  if (asText) return clip(asText);
  if (!Predicate.isObject(nested)) return undefined;
  if (!('message' in nested)) return undefined;
  const message = nonEmptyString(nested.message);
  return message ? clip(message) : undefined;
};

const effectMessage = (value: FailureFields): string | undefined => {
  const tag = readString(value, '_tag');
  const operation = readString(value, 'operation');
  const causeMessage = nestedCauseMessage(value);
  const parts: string[] = [];
  if (tag) parts.push(tag);
  if (operation) parts.push(operation);
  if (causeMessage) parts.push(causeMessage);
  return parts.length > 0 ? parts.join(': ') : undefined;
};

const rewriteStackHeadline = (error: Error) => {
  if (!Predicate.isString(error.stack) || error.stack.length === 0) return;
  const lines = error.stack.split('\n');
  lines[0] = `${error.name}: ${error.message}`;
  error.stack = lines.join('\n');
};

const failureObject = (cause: Cause.Cause<unknown>, error: Error): FailureFields => {
  const found = Cause.findErrorOption(cause);
  if (Option.isSome(found)) {
    const fields = toFailureFields(found.value);
    if (fields) return fields;
  }
  return toFailureFields(error) ?? {};
};

const statusForTag = (tag: string | undefined): number | undefined => {
  if (!tag || !isKnownTag(tag)) return undefined;
  return TAG_STATUS[tag];
};

const statusForTrpcCode = (code: string | undefined): number | undefined => {
  switch (code) {
    case 'NOT_FOUND':
      return 404;
    case 'BAD_REQUEST':
      return 400;
    case 'UNAUTHORIZED':
      return 401;
    case 'FORBIDDEN':
      return 403;
    case 'CONFLICT':
      return 409;
    case 'INTERNAL_SERVER_ERROR':
      return 500;
    default:
      return undefined;
  }
};

const httpStatus = (value: FailureFields): number | undefined =>
  statusForTag(readString(value, '_tag')) ??
  statusForTrpcCode(readString(value, 'code')) ??
  readStatus(value);

export const isExpectedFailureValue = (cause: unknown): boolean => {
  let current = toFailureFields(cause);
  let depth = 0;
  while (current && depth < 8) {
    const tag = readString(current, '_tag');
    if (tag && EXPECTED_TAGS.has(tag)) return true;
    const code = readString(current, 'code');
    if (code && EXPECTED_TRPC_CODES.has(code)) return true;
    if (readStatus(current) === 404) return true;
    current = toFailureFields(current.cause);
    depth += 1;
  }
  return false;
};

const effectFields = (value: FailureFields): EffectFields => {
  const fields: EffectFields = {};
  const operation = readString(value, 'operation');
  const key = readString(value, 'key');
  const provider = readString(value, 'provider');
  const batchId = readString(value, 'batchId') ?? readString(value, 'batch_id');
  const resource = readString(value, 'resource');
  const causeMessage = nestedCauseMessage(value);
  if (operation) fields.operation = operation;
  if (key) fields.key = key;
  if (provider) fields.provider = provider;
  if (batchId) fields.batchId = batchId;
  if (resource) fields.resource = resource;
  if (causeMessage) fields.causeMessage = causeMessage;
  return fields;
};

const readHeader = (request: Request, name: string): string | undefined =>
  nonEmptyString(request.headers.get(name));

const pathnameOf = (request: Request): string | undefined => {
  try {
    return new URL(request.url).pathname;
  } catch {
    return undefined;
  }
};

export const markReported = (cause: unknown) => {
  if (!Predicate.isObject(cause)) return;
  reportedErrors.add(cause);
};

export const wasReported = (cause: unknown): boolean => {
  let current = cause;
  let depth = 0;
  while (Predicate.isObject(current) && depth < 8) {
    if (reportedErrors.has(current)) return true;
    if (!('cause' in current)) return false;
    current = current.cause;
    depth += 1;
  }
  return false;
};

/** Error PostHog should show, with the Effect tag, operation, and nested cause filled in. */
export const prettyFailureError = (cause: Cause.Cause<unknown>): Error => {
  const rendered = Cause.prettyErrors(cause, { includeCauseInStack: true });
  const error = rendered[0] ?? new Error('Unexpected server error');
  const message = effectMessage(failureObject(cause, error));
  if (error.message.length === 0 && message) {
    error.message = message;
    rewriteStackHeadline(error);
  }
  return error;
};

export const contextFromRequest = (request: Request, userId?: string): CaptureContext => {
  const context: CaptureContext = {};
  const headerDistinctId = readHeader(request, DISTINCT_ID_HEADER);
  const sessionId = readHeader(request, SESSION_ID_HEADER);
  const pathname = pathnameOf(request);
  if (headerDistinctId) context.headerDistinctId = headerDistinctId;
  if (sessionId) context.sessionId = sessionId;
  if (userId) context.userId = userId;
  if (request.method.length > 0) context.method = request.method;
  if (pathname) context.pathname = pathname;
  return context;
};

const isReportable = (cause: Cause.Cause<unknown>, error: Error): boolean => {
  if (error.name === 'InterruptError') return false;
  const source = failureObject(cause, error);
  if (isExpectedFailureValue(source) || isExpectedFailureValue(error)) return false;
  if (httpStatus(source) === 404 || httpStatus(error) === 404) return false;
  return true;
};

export const describeCapture = (
  cause: Cause.Cause<unknown>,
  error: Error,
  source: string,
  context: CaptureContext
): CapturePlan | undefined => {
  if (!isReportable(cause, error)) return undefined;

  const failure = failureObject(cause, error);
  const properties: CaptureProperties = {
    source,
    effect_cause: clip(Cause.pretty(cause))
  };
  const tag = readString(failure, '_tag');
  if (tag) properties.effect_tag = tag;
  const fields = JSON.stringify(effectFields(failure));
  if (fields !== '{}') properties.effect_fields = fields;
  const status = httpStatus(failure);
  if (status !== undefined && status !== 404) properties.http_status = status;
  if (context.sessionId) properties.$session_id = context.sessionId;
  if (context.method) properties.method = context.method;
  if (context.pathname) properties.pathname = context.pathname;

  const headerDistinctId = nonEmptyString(context.headerDistinctId);
  const userId = nonEmptyString(context.userId);
  return {
    error,
    distinctId: headerDistinctId ?? userId,
    properties
  };
};

export const isPosthogServerEnabled = (): boolean => {
  if (import.meta.env.PROD !== true || import.meta.env.SSR !== true) return false;
  const key = import.meta.env.VITE_POSTHOG_KEY;
  const host = import.meta.env.VITE_POSTHOG_URL;
  return Predicate.isString(key) && key.length > 0 && Predicate.isString(host) && host.length > 0;
};

export const deliverIfEnabled = async (
  cause: Cause.Cause<unknown>,
  source: string,
  error: Error
): Promise<boolean> => {
  if (!isPosthogServerEnabled()) return false;
  try {
    const { deliverPrepared } = await import('./report_server_error');
    return await deliverPrepared(cause, source, error);
  } catch (cause: unknown) {
    console.error('[posthog] exception capture failed', cause);
    return false;
  }
};

export const reportSwallowedFailure = async (cause: unknown, source: string): Promise<void> => {
  try {
    const effectCause = Cause.fail(cause);
    const error = prettyFailureError(effectCause);
    await deliverIfEnabled(effectCause, source, error);
  } catch (cause: unknown) {
    console.error('[posthog] exception capture failed', cause);
  }
};

export const reportSwallowedEffect = (cause: unknown, source: string) =>
  Effect.promise(() => reportSwallowedFailure(cause, source));
