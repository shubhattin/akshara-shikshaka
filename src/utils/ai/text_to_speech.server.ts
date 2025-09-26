import OpenAI from 'openai';
import { z } from 'zod';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const VOICE_TYPE_LIST = [
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'nova',
  'onyx',
  'sage',
  'shimmer'
] as const;

type voice_types = (typeof VOICE_TYPE_LIST)[number];
export const VoiceTypeEnum = z.enum(VOICE_TYPE_LIST);

type Input = {
  text: string;
  instructions: string;
  voice: voice_types;
};
export const generateGpt4oMiniTtsSpeech = async (input: Input) => {
  const audio = await openai.audio.speech.create({
    model: 'gpt-4o-mini-tts',
    voice: input.voice,
    input: input.text,
    instructions: input.instructions,
    response_format: 'opus'
  });

  const buffer = Buffer.from(await audio.arrayBuffer());
  return {
    fileBuffer: buffer,
    fileType: 'webm' as const
  };
};
