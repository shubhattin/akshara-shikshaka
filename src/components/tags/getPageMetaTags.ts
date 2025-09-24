import { type Metadata } from 'next';

interface ShareImageInfo {
  url: string;
  width: number;
  height: number;
}

interface Props {
  title: string;
  description?: string | null;
  share_image_info?: ShareImageInfo;
}

export function getMetadata({ title, description = null, share_image_info }: Props): Metadata {
  return {
    title,
    description: description || undefined,
    openGraph: {
      title,
      description: description || undefined,
      //   url: '',
      siteName: 'Padavali',
      // images: [
      //   {
      //     url: image.url,
      //     width: image.width,
      //     height: image.height
      //   }
      // ],
      type: 'website'
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: description || undefined
      // images: [image.url]
    }
  } satisfies Metadata;
}
