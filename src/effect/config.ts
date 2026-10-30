import { Context, Effect, Layer, Redacted, Schema } from 'effect';
import { ConfigError } from './errors';

const AppConfigSchema = Schema.Struct({
  dbUrl: Schema.String,
  upstashRedisUrl: Schema.String,
  upstashRedisToken: Schema.String,
  awsRegion: Schema.String,
  awsAccessKeyId: Schema.String,
  awsSecretAccessKey: Schema.String,
  awsS3BucketName: Schema.String,
  openaiApiKey: Schema.String,
  openrouterApiKey: Schema.String,
  turnstileSecretKey: Schema.optional(Schema.String),
  betterAuthUrl: Schema.String,
  qstashUrl: Schema.optional(Schema.String),
  qstashToken: Schema.String,
  qstashCurrentSigningKey: Schema.String,
  qstashNextSigningKey: Schema.String,
  siteUrl: Schema.optional(Schema.String),
  isQstashEnabled: Schema.Boolean,
  isDev: Schema.Boolean,
  isProd: Schema.Boolean
});

export type AppConfigValues = {
  readonly dbUrl: Redacted.Redacted<string>;
  readonly upstashRedisUrl: string;
  readonly upstashRedisToken: Redacted.Redacted<string>;
  readonly awsRegion: string;
  readonly awsAccessKeyId: string;
  readonly awsSecretAccessKey: Redacted.Redacted<string>;
  readonly awsS3BucketName: string;
  readonly openaiApiKey: Redacted.Redacted<string>;
  readonly openrouterApiKey: Redacted.Redacted<string>;
  readonly turnstileSecretKey: Redacted.Redacted<string> | undefined;
  readonly betterAuthUrl: string;
  /** Regional QStash API (e.g. `https://qstash-us-east-1.upstash.io`); the SDK default otherwise */
  readonly qstashUrl: string | undefined;
  readonly qstashToken: Redacted.Redacted<string>;
  readonly qstashCurrentSigningKey: Redacted.Redacted<string>;
  readonly qstashNextSigningKey: Redacted.Redacted<string>;
  /** Public origin QStash calls back (no trailing slash); also the signed `sub` of each message */
  readonly siteUrl: string | undefined;
  /**
   * QStash only delivers to public URLs, so it is on for production deployments; elsewhere
   * agent batches run in-process.
   */
  readonly isQstashEnabled: boolean;
  readonly isDev: boolean;
  readonly isProd: boolean;
};

const resolveDbUrl = (env: NodeJS.ProcessEnv): string | undefined => {
  if (env.DB_MODE === 'PROD') return env.PG_DATABASE_URL1 ?? env.PG_DATABASE_URL;
  if (env.DB_MODE === 'PREVIEW') return env.PG_DATABASE_URL2 ?? env.PG_DATABASE_URL;
  return env.PG_DATABASE_URL;
};

const isProductionDeployment = (env: NodeJS.ProcessEnv): boolean =>
  env.VERCEL_ENV === 'production' ||
  (env.VERCEL_ENV === undefined && env.NODE_ENV === 'production');

/** Public origin of this deployment; QStash publishing and its signature check share it. */
export const resolveSiteUrl = (env: NodeJS.ProcessEnv): string | undefined => {
  const url =
    env.VITE_BASE_URL ??
    (env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined);
  return url?.replace(/\/+$/, '');
};

const loadConfig = Effect.fn('loadConfig')(function* () {
  const env = process.env;
  const parsed = Schema.decodeUnknownExit(AppConfigSchema)({
    dbUrl: resolveDbUrl(env),
    upstashRedisUrl: env.UPSTASH_REDIS_REST_URL,
    upstashRedisToken: env.UPSTASH_REDIS_REST_TOKEN,
    awsRegion: env.AWS_REGION,
    awsAccessKeyId: env.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    awsS3BucketName: env.AWS_S3_FILES_BUCKET_NAME,
    openaiApiKey: env.OPENAI_API_KEY,
    openrouterApiKey: env.OPENROUTER_API_KEY ?? import.meta.env?.OPENROUTER_API_KEY,
    turnstileSecretKey: env.TURNSTILE_SECRET_KEY,
    betterAuthUrl: env.VITE_BETTER_AUTH_URL,
    qstashUrl: env.QSTASH_URL,
    qstashToken: env.QSTASH_TOKEN,
    qstashCurrentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
    qstashNextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
    siteUrl: resolveSiteUrl(env),
    isQstashEnabled: env.QSTASH_ENABLED
      ? env.QSTASH_ENABLED === 'true'
      : isProductionDeployment(env),
    isDev: import.meta.env?.DEV === true || env.NODE_ENV === 'development',
    isProd: import.meta.env?.PROD === true || env.NODE_ENV === 'production'
  });

  if (parsed._tag === 'Failure') {
    return yield* Effect.fail(
      ConfigError.make({
        message: 'Invalid application configuration',
        cause: parsed.cause
      })
    );
  }

  const data = parsed.value;
  return {
    dbUrl: Redacted.make(data.dbUrl),
    upstashRedisUrl: data.upstashRedisUrl,
    upstashRedisToken: Redacted.make(data.upstashRedisToken),
    awsRegion: data.awsRegion,
    awsAccessKeyId: data.awsAccessKeyId,
    awsSecretAccessKey: Redacted.make(data.awsSecretAccessKey),
    awsS3BucketName: data.awsS3BucketName,
    openaiApiKey: Redacted.make(data.openaiApiKey),
    openrouterApiKey: Redacted.make(data.openrouterApiKey),
    turnstileSecretKey: data.turnstileSecretKey
      ? Redacted.make(data.turnstileSecretKey)
      : undefined,
    betterAuthUrl: data.betterAuthUrl,
    qstashUrl: data.qstashUrl,
    qstashToken: Redacted.make(data.qstashToken),
    qstashCurrentSigningKey: Redacted.make(data.qstashCurrentSigningKey),
    qstashNextSigningKey: Redacted.make(data.qstashNextSigningKey),
    siteUrl: data.siteUrl,
    isQstashEnabled: data.isQstashEnabled,
    isDev: data.isDev,
    isProd: data.isProd
  } satisfies AppConfigValues;
});

export class AppConfig extends Context.Service<AppConfig, AppConfigValues>()('AppConfig') {
  static readonly Live = Layer.effect(AppConfig)(loadConfig());
}
