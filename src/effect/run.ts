import { Cause, Effect, Exit, Option } from 'effect';
import { TRPCError } from '@trpc/server';
import { appRuntime } from './runtime';
import { isKnownError, type KnownError } from './errors';

/** Domain / config errors with distinct tRPC codes; infra errors share the default. */
// oxlint-disable-next-line anti-slop/no-known-value-widening -- Partial record widening needed for KnownError tag lookup; satisfies loses index signature
const TRPC_CODE_BY_TAG: Partial<Record<KnownError['_tag'], TRPCError['code']>> = {
  NotFoundError: 'NOT_FOUND',
  BadRequestError: 'BAD_REQUEST',
  UnauthorizedError: 'UNAUTHORIZED',
  ConfigError: 'INTERNAL_SERVER_ERROR'
};

const toTrpcMessage = (error: KnownError): string => {
  switch (error._tag) {
    case 'NotFoundError':
    case 'BadRequestError':
    case 'ConfigError':
      return error.message;
    case 'UnauthorizedError':
      return error.message ?? 'Unauthorized';
    default:
      return 'Unexpected server error';
  }
};

const toTrpcError = (error: KnownError): TRPCError =>
  new TRPCError({
    code: TRPC_CODE_BY_TAG[error._tag] ?? 'INTERNAL_SERVER_ERROR',
    message: toTrpcMessage(error),
    cause: error
  });

/**
 * Run an Effect at the tRPC boundary. This is the only place routers should
 * call into the Effect runtime.
 */
export const runTrpcEffect = async <A, E, R>(effect: Effect.Effect<A, E, R>): Promise<A> => {
  const exit = await appRuntime.runPromiseExit(
    // SAFETY: validated at boundary - type assertion is safe based on prior schema check.
    effect.pipe(Effect.annotateLogs({ boundary: 'trpc' })) as Effect.Effect<A, E>
  );

  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  const failure = Cause.findErrorOption(exit.cause);
  if (Option.isSome(failure) && isKnownError(failure.value)) {
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
 * Run an Effect at the route-loader / server-fn boundary.
 * Prefer this over Promise facades around Effect services.
 */
export const runLoaderEffect = <A, E, R>(effect: Effect.Effect<A, E, R>): Promise<A> =>
  appRuntime.runPromise(
    // SAFETY: validated at boundary - type assertion is safe based on prior schema check.
    effect.pipe(Effect.annotateLogs({ boundary: 'loader' })) as Effect.Effect<A, E>
  );

/**
 * Run an Effect that already encodes business failures as success values
 * (e.g. discriminated unions). Unexpected infrastructure errors still map to TRPCError.
 */
export const runTrpcEffectResult = runTrpcEffect;
