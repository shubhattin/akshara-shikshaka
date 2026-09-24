'use client';

import { type PostHog } from 'posthog-js';
import { useEffect } from 'react';
import { useSession } from '~/lib/auth-client';

let posthogReady: Promise<void> | undefined;
let didInit = false;

const posthogEnabled = () =>
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- runtime env check; window may be undefined during SSR
  typeof window !== 'undefined' &&
  window.location.hostname !== 'localhost' &&
  !import.meta.env.DEV &&
  Boolean(import.meta.env.VITE_POSTHOG_KEY) &&
  Boolean(import.meta.env.VITE_POSTHOG_URL);

export const load_posthog = async (func?: (posthog: PostHog) => void) => {
  if (!posthogEnabled()) return;

  const posthog = await import('posthog-js');
  if (func) {
    func(posthog.default);
  }
};

type PosthogPerson = {
  email?: string;
  name?: string;
};

const personProperties = (
  email: string | null | undefined,
  name: string | null | undefined
): PosthogPerson => {
  const properties: PosthogPerson = {};
  if (email) properties.email = email;
  if (name) properties.name = name;
  return properties;
};

export const reset_posthog = () =>
  (posthogReady ?? Promise.resolve()).then(() =>
    load_posthog((posthog) => {
      posthog.reset();
    })
  );

export default function PosthogInit() {
  const { data: session } = useSession();
  const user = session?.user;

  useEffect(() => {
    posthogReady = load_posthog((posthog) => {
      if (didInit) return;
      didInit = true;
      posthog.init(import.meta.env.VITE_POSTHOG_KEY!, {
        api_host: `${import.meta.env.VITE_POSTHOG_URL!}`,
        person_profiles: 'identified_only',
        ui_host: 'https://us.posthog.com',
        capture_exceptions: true,
        tracing_headers: [window.location.hostname],
        session_recording: { maskAllInputs: true }
      });
    });
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const userId = user.id;
    const email = user.email;
    const name = user.name;
    void (posthogReady ?? Promise.resolve()).then(() =>
      load_posthog((posthog) => {
        posthog.identify(userId, personProperties(email, name));
      })
    );
  }, [user?.id, user?.email, user?.name]);

  return <></>;
}
