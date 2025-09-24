import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function generateImageGptImage1(prompt: string) {
  const response = await openai.images.generate({
    model: 'gpt-image-1',
    prompt: prompt,
    size: '1024x1024',
    quality: 'low',
    moderation: 'low',
    output_compression: 100,
    output_format: 'webp',
    n: 1
  });
  if (!response.data?.[0]) {
    throw new Error('Failed to generate image');
  }
  return {
    b64_json: response.data[0].b64_json!,
    // revised_prompt: response.data[0].revised_prompt,
    image_format: 'webp'
  };
}

export async function generateImageDallE3_(prompt: string) {
  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt: prompt,
    size: '1024x1024',
    quality: 'standard',
    response_format: 'b64_json',
    style: 'natural', // not vivid
    n: 1
  });
  if (!response.data?.[0]) {
    throw new Error('Failed to generate image');
  }

  return {
    b64_json: response.data[0].b64_json!,
    revised_prompt: response.data[0].revised_prompt,
    image_format: 'png'
  };
}
