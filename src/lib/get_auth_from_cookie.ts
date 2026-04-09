import type { authClient } from '@/lib/auth-client';
import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequestHeader } from '@tanstack/react-start/server';

const get_seesion_from_cookie = async (cookie: string) => {
  try {
    const res = await fetch(`${import.meta.env.VITE_BETTER_AUTH_URL}/api/auth/get-session`, {
      method: 'GET',
      headers: {
        Cookie: cookie
      }
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch session: ${res.statusText}`);
    }
    const session = (await res.json()) as typeof authClient.$Infer.Session;
    // console.log('session', !!session, new Date().toISOString());
    return session;
  } catch (e) {
    return null;
  }
};

export const getUserSession$ = createIsomorphicFn()
  .client(async () => {
    const { authClient } = await import('@/lib/auth-client');
    const session = (await authClient.getSession()).data;
    return session;
  })
  .server(async () => {
    const cookie = getRequestHeader('cookie');
    const session = await get_seesion_from_cookie(cookie ?? '');
    return session;
  });
