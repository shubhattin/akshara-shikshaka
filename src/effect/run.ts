import { Cause, Effect, Exit } from 'effect';
import { TRPCError } from '@trpc/server';
import { appRuntime } from './runtime';
import {
  AiProviderError,
  BadRequestError,
  CacheError,
  ConfigError,
  DatabaseError,
  ImageProcessingError,
  NotFoundError,
  RedisError,
  StorageError,
  UnauthorizedError
} from './errors';

type KnownError =
  | DatabaseError
  | RedisError
  | CacheError
  | StorageError
  | AiProviderError
  | ImageProcessingError
  | ConfigError
  | NotFoundError
  | BadRequestError
  | UnauthorizedError;

const toTrpcError = (error: KnownError): TRPCError => {
  switch (error._tag) {
    case 'NotFoundError':
      return new TRPCError({ code: 'NOT_FOUND', message: error.message, cause: error });
    case 'BadRequestError':
      return new TRPCError({ code: 'BAD_REQUEST', message: error.message, cause: error });
    case 'UnauthorizedError':
      return new TRPCError({
        code: 'UNAUTHORIZED',
        message: error.message ?? 'Unauthorized',
        cause: error
      });
    case 'ConfigError':
      return new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message,
        cause: error
      });
    default:
      return new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unexpected server error',
        cause: error
      });
  }
};

const isKnownError = (error: unknown): error is KnownError =>
  typeof error === 'object' &&
  error !== null &&
  '_tag' in error &&
  typeof (error as { _tag: unknown })._tag === 'string' &&
  [
    'DatabaseError',
    'RedisError',
    'CacheError',
    'StorageError',
    'AiProviderError',
    'ImageProcessingError',
    'ConfigError',
    'NotFoundError',
    'BadRequestError',
    'UnauthorizedError'
  ].includes((error as { _tag: string })._tag);

/**
 * Run an Effect at the tRPC boundary. This is the only place routers should
 * call into the Effect runtime.
 */
export const runTrpcEffect = async <A, E, R>(effect: Effect.Effect<A, E, R>): Promise<A> => {
  const exit = await appRuntime.runPromiseExit(
    effect.pipe(Effect.annotateLogs({ boundary: 'trpc' })) as Effect.Effect<A, E>
  );

  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  const failure = Cause.findErrorOption(exit.cause);
  if (failure._tag === 'Some' && isKnownError(failure.value)) {
    throw toTrpcError(failure.value);
  }

  console.error('[trpc] unexpected effect defect', Cause.pretty(exit.cause));
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Unexpected server error',
    cause: exit.cause
  });
};

/**
 * Run an Effect that already encodes business failures as success values
 * (e.g. discriminated unions). Unexpected infrastructure errors still map to TRPCError.
 */
export const runTrpcEffectResult = runTrpcEffect;
