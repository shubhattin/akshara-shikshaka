'use client';

import { type PostHog } from 'posthog-js';
import { useEffect } from 'react';

export const load_posthog = async (func?: (posthog: PostHog) => void) => {
  if (
    typeof window === 'undefined' ||
    window.location.hostname === 'localhost' ||
    process.env.NODE_ENV === 'development' ||
    !process.env.import.meta.env.VITE_AWS_CLOUDFRONT_URL_POSTHOG_KEY ||
    !process.env.import.meta.env.VITE_AWS_CLOUDFRONT_URL_POSTHOG_URL
  )
    return;

  const posthog = await import('posthog-js');
  if (func) {
    func(posthog.default);
  }
};

export default function PosthogInit() {
  useEffect(() => {
    load_posthog((posthog) => {
      posthog.init(process.env.import.meta.env.VITE_AWS_CLOUDFRONT_URL_POSTHOG_KEY!, {
        api_host: `${process.env.import.meta.env.VITE_AWS_CLOUDFRONT_URL_POSTHOG_URL!}`,
        person_profiles: 'identified_only',
        ui_host: 'https://us.posthog.com'
      });
    });
  }, []);
  return <></>;
}
