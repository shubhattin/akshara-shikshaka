import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

type voice_types =
  | 'alloy'
  | 'ash'
  | 'ballad'
  | 'coral'
  | 'echo'
  | 'fable'
  | 'nova'
  | 'onyx'
  | 'sage'
  | 'shimmer';

export const generateGpt4oMiniTtsSpeech = async (
  input: string,
  instructions: string,
  voice: voice_types
) => {
  const mp3 = await openai.audio.speech.create({
    model: 'gpt-4o-mini-tts',
    voice: voice,
    input: input,
    instructions: instructions,
    response_format: 'opus'
  });

  const buffer = Buffer.from(await mp3.arrayBuffer());
  return {
    fileBuffer: buffer,
    fileType: 'webm' as const
  };
};
