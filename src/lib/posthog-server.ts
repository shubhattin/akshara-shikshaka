import { PostHog } from 'posthog-node';
import { Predicate } from 'effect';

let posthogClient: PostHog | undefined;

/** One server client, created only for a production build that has the project key. */
export const getPostHogClient = (): PostHog | undefined => {
  if (import.meta.env.PROD !== true) return undefined;

  const apiKey = import.meta.env.VITE_POSTHOG_KEY;
  const host = import.meta.env.VITE_POSTHOG_URL;
  if (!Predicate.isString(apiKey) || apiKey.length === 0) return undefined;
  if (!Predicate.isString(host) || host.length === 0) return undefined;

  if (!posthogClient) {
    posthogClient = new PostHog(apiKey, {
      host,
      flushAt: 1,
      flushInterval: 0
    });
  }

  return posthogClient;
};
