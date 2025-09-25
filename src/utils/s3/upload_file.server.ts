import { z } from 'zod';
import mime from 'mime-types';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
  StorageClass
} from '@aws-sdk/client-s3';

const envs_parsed = z
  .object({
    AWS_REGION: z.string(),
    AWS_ACCESS_KEY_ID: z.string(),
    AWS_SECRET_ACCESS_KEY: z.string(),
    AWS_S3_FILES_BUCKET_NAME: z.string()
  })
  .safeParse(process.env);
if (!envs_parsed.success) {
  console.error(envs_parsed.error);
  throw new Error('Invalid environment variables');
}
const envs = envs_parsed.data;

const s3 = new S3Client({
  region: envs.AWS_REGION,
  credentials: {
    accessKeyId: envs.AWS_ACCESS_KEY_ID,
    secretAccessKey: envs.AWS_SECRET_ACCESS_KEY
  }
});

async function uploadFile(bucketName: string, key: string, fileBuffer: Buffer) {
  const uploadParams: PutObjectCommandInput = {
    Bucket: bucketName,
    Key: key,
    Body: fileBuffer,
    ContentType: mime.lookup(key) || 'application/octet-stream',
    StorageClass: StorageClass.STANDARD
  };

  const data = await s3.send(new PutObjectCommand(uploadParams));
  return data;
}

const ASSET_BUCKET_NAME = envs.AWS_S3_FILES_BUCKET_NAME;

type location_types = `image_assets/${string}.webp` | `audio_assets/${string}.webm`;
export const uploadAssetFile = async (key: location_types, fileBuffer: Buffer) => {
  const data = await uploadFile(ASSET_BUCKET_NAME, key, fileBuffer);
  return data;
};

export const deleteAssetFile = async (key: string) => {
  const data = await s3.send(
    new DeleteObjectCommand({
      Bucket: ASSET_BUCKET_NAME,
      Key: key
    })
  );
  return data;
};
