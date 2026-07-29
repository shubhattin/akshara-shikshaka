/**
 * Legacy Promise wrappers — prefer Effect services via `~/effect/*`.
 * Kept for any remaining non-Effect callers.
 */
export { VoiceTypeEnum } from '~/effect/ai';
export type { VoiceType } from '~/effect/ai';

import { Effect } from 'effect';
import { appRuntime } from '~/effect/runtime';
import { AiProvider, type VoiceType } from '~/effect/ai';

export const generateGpt4oMiniTtsSpeech = async (input: {
  text: string;
  instructions: string;
  voice: VoiceType;
}) =>
  appRuntime.runPromise(
    Effect.gen(function* () {
      const ai = yield* AiProvider;
      return yield* ai.generateSpeech(input);
    })
  );
