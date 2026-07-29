import { Context, Effect, Layer, Redacted } from 'effect';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
  StorageClass,
  type PutObjectCommandInput
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import mime from 'mime-types';
import ms from 'ms';
import type { PROJECT_S3_ALIAS } from '~/constants';
import { AppConfig } from './config';
import { StorageError } from './errors';

export type AssetLocation =
  | `${typeof PROJECT_S3_ALIAS}/image_assets/${string}.webp`
  | `${typeof PROJECT_S3_ALIAS}/audio_assets/${string}.webm`;

const tryStorage = <A>(operation: string, key: string | undefined, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => StorageError.make({ operation, key, cause })
  }).pipe(Effect.annotateLogs({ category: 'storage', operation, key }));

export class ObjectStorage extends Context.Service<
  ObjectStorage,
  {
    readonly uploadAssetFile: (
      key: AssetLocation,
      fileBuffer: Buffer
    ) => Effect.Effect<unknown, StorageError>;
    readonly deleteAssetFile: (key: string) => Effect.Effect<unknown, StorageError>;
    readonly getAudioAssetUploadUrl: (
      key: `${typeof PROJECT_S3_ALIAS}/audio_assets/${string}.webm`
    ) => Effect.Effect<string, StorageError>;
  }
>()('ObjectStorage') {
  static readonly Live = Layer.effect(ObjectStorage)(
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const s3 = new S3Client({
        region: config.awsRegion,
        credentials: {
          accessKeyId: config.awsAccessKeyId,
          secretAccessKey: Redacted.value(config.awsSecretAccessKey)
        }
      });
      const bucket = config.awsS3BucketName;

      return {
        uploadAssetFile: (key, fileBuffer) =>
          tryStorage('uploadAssetFile', key, async () => {
            const uploadParams: PutObjectCommandInput = {
              Bucket: bucket,
              Key: key,
              Body: fileBuffer,
              ContentType: mime.lookup(key) || 'application/octet-stream',
              StorageClass: StorageClass.STANDARD
            };
            return s3.send(new PutObjectCommand(uploadParams));
          }),
        deleteAssetFile: (key) =>
          tryStorage('deleteAssetFile', key, () =>
            s3.send(
              new DeleteObjectCommand({
                Bucket: bucket,
                Key: key
              })
            )
          ),
        getAudioAssetUploadUrl: (key) =>
          tryStorage('getAudioAssetUploadUrl', key, () => {
            const command = new PutObjectCommand({
              Bucket: bucket,
              Key: key,
              ContentType: mime.lookup(key) || 'application/octet-stream',
              StorageClass: StorageClass.STANDARD
            });
            return getSignedUrl(s3, command, {
              expiresIn: ms('30secs') / 1000
            });
          })
      };
    })
  );
}
