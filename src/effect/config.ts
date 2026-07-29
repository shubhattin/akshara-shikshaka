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
  openrouterApiKey: Schema.optional(Schema.String),
  turnstileSecretKey: Schema.optional(Schema.String),
  isDev: Schema.Boolean
});

export type AppConfigShape = {
  readonly dbUrl: Redacted.Redacted<string>;
  readonly upstashRedisUrl: string;
  readonly upstashRedisToken: Redacted.Redacted<string>;
  readonly awsRegion: string;
  readonly awsAccessKeyId: string;
  readonly awsSecretAccessKey: Redacted.Redacted<string>;
  readonly awsS3BucketName: string;
  readonly openaiApiKey: Redacted.Redacted<string>;
  readonly openrouterApiKey: Redacted.Redacted<string> | undefined;
  readonly turnstileSecretKey: Redacted.Redacted<string> | undefined;
  readonly isDev: boolean;
};

const resolveDbUrl = (env: NodeJS.ProcessEnv): string | undefined => {
  if (env.DB_MODE === 'PROD') return env.PG_DATABASE_URL1 ?? env.PG_DATABASE_URL;
  if (env.DB_MODE === 'PREVIEW') return env.PG_DATABASE_URL2 ?? env.PG_DATABASE_URL;
  return env.PG_DATABASE_URL;
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
    isDev: import.meta.env?.DEV === true || env.NODE_ENV === 'development'
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
    openrouterApiKey: data.openrouterApiKey ? Redacted.make(data.openrouterApiKey) : undefined,
    turnstileSecretKey: data.turnstileSecretKey
      ? Redacted.make(data.turnstileSecretKey)
      : undefined,
    isDev: data.isDev
  } satisfies AppConfigShape;
});

export class AppConfig extends Context.Service<AppConfig, AppConfigShape>()('AppConfig') {
  static readonly Live = Layer.effect(AppConfig)(loadConfig());
}
