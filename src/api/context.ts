import { getSessionFromCookie } from '@/lib/get_auth_from_cookie';

export const createContext = async ({ req }: { req: Request }) => {
  const cookie = req.headers.get('cookie') ?? '';
  const session = await getSessionFromCookie(cookie);
  const user = session?.user;

  return {
    user,
    cookie
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
