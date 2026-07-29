import { Context, Effect, Layer } from 'effect';
import sharp from 'sharp';
import { ImageProcessingError } from './errors';

export class ImageProcessor extends Context.Service<
  ImageProcessor,
  {
    readonly resizeImage: (
      inputPng: Buffer | string,
      width: number,
      height: number,
      webp_options?: sharp.WebpOptions
    ) => Effect.Effect<Buffer, ImageProcessingError>;
  }
>()('ImageProcessor') {
  static readonly Live = Layer.succeed(ImageProcessor)({
    resizeImage: (inputPng, width, height, webp_options) =>
      Effect.tryPromise({
        try: async () => {
          const webpBuffer = await sharp(inputPng, { limitInputPixels: false })
            .resize({
              width,
              height,
              fit: 'cover',
              position: 'centre',
              kernel: sharp.kernel.lanczos3,
              withoutEnlargement: true,
              fastShrinkOnLoad: true
            })
            .webp({
              quality: 80,
              effort: 5,
              alphaQuality: 80,
              lossless: false,
              nearLossless: false,
              smartSubsample: true,
              ...webp_options
            })
            .toBuffer();
          return webpBuffer;
        },
        catch: (cause) => ImageProcessingError.make({ operation: 'resizeImage', cause })
      }).pipe(Effect.annotateLogs({ category: 'image', operation: 'resizeImage' }))
  });
}
