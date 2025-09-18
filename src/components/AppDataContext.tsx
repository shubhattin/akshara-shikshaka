'use client';

import { createContext, useEffect, useState } from 'react';
import { authClient, useSession } from '~/lib/auth-client';

type SessionType = (typeof authClient.$Infer.Session)['user'] | null;
export const AppContext = createContext<{
  user_info: SessionType;
}>({
  user_info: null
});

export const AppContextProvider = ({
  children,
  initialSession
}: {
  children: React.ReactNode;
  initialSession: typeof authClient.$Infer.Session | null;
}) => {
  const session = useSession();

  const [userInfoFetched, setUserInfoFetched] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined' && !session.isPending && session.data) {
      setUserInfoFetched(true);
    }
  }, [session]);

  const user_info = (!userInfoFetched ? initialSession : session.data)?.user ?? null;

  return <AppContext.Provider value={{ user_info }}>{children}</AppContext.Provider>;
};
