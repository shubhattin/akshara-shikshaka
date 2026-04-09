'use client';
import { QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink, createTRPCClient } from '@trpc/client';
import { useState } from 'react';
import transformer from './transformer';
import { TRPCProvider } from './client';
import { queryClient as queryClientGlobal } from '~/state/queryClient';
import type { AppRouter } from './trpc_router';

export default function Provider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(queryClientGlobal);
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: '/api/trpc',
          transformer
        })
      ]
    })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
