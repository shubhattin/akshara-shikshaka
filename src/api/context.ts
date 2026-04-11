import { getServerUserSession$ } from '@/lib/get_auth_from_cookie';

export const createContext = async () => {
  const session = await getServerUserSession$();
  // a server only function can be directly called in the trpc
  const user = session?.user;

  return {
    user
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
