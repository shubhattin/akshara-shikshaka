/**
 * Legacy Promise wrapper — prefer `ImageProcessor` from `~/effect/image`.
 */
import type sharp from 'sharp';
import { Effect } from 'effect';
import { appRuntime } from '~/effect/runtime';
import { ImageProcessor } from '~/effect/image';

export const resizeImage = async (
  inputPng: Buffer | string,
  width: number,
  height: number,
  webp_options?: sharp.WebpOptions
) =>
  appRuntime.runPromise(
    Effect.gen(function* () {
      const images = yield* ImageProcessor;
      return yield* images.resizeImage(inputPng, width, height, webp_options);
    })
  );
