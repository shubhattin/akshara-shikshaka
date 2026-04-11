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

/** TanStack Router `head` meta entries (no Next.js `Metadata` type). */
export function routeHeadFromPageMeta({ title, description = null }: Props) {
  const desc = description || undefined;
  return {
    meta: [
      { title },
      ...(desc ? ([{ name: 'description', content: desc }] as const) : []),
      { property: 'og:title', content: title },
      ...(desc ? ([{ property: 'og:description', content: desc }] as const) : []),
      { property: 'og:site_name', content: 'Padavali' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      ...(desc ? ([{ name: 'twitter:description', content: desc }] as const) : [])
    ]
  };
}

/** @deprecated Prefer `routeHeadFromPageMeta` for TanStack routes; kept for transitional typing. */
export function getMetadata({ title, description = null }: Props) {
  return {
    title,
    description: description || undefined,
    openGraph: {
      title,
      description: description || undefined,
      siteName: 'Padavali',
      type: 'website' as const
    },
    twitter: {
      card: 'summary_large_image' as const,
      title,
      description: description || undefined
    }
  };
}
