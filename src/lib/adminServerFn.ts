import { redirect } from '@tanstack/react-router';
import { createMiddleware, createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { getSessionFromCookie } from './get_auth_from_cookie';

export const adminServerFnMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const session = await getSessionFromCookie(getRequest().headers.get('cookie') ?? '');

    if (!session?.user || session.user.role !== 'admin') {
      throw redirect({ to: '/' });
    }

    return next({
      context: {
        session,
        user: session.user
      }
    });
  }
);

export function createAdminServerFn(options?: Parameters<typeof createServerFn>[0]) {
  return createServerFn(options).middleware([adminServerFnMiddleware]);
}
