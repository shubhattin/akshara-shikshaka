import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools';
import { TanStackDevtools } from '@tanstack/react-devtools';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { useState } from 'react';

import appCss from '../styles.css?url';
import '../app.scss';
import { TRPCProvider } from '~/api/client';
import transformer from '~/api/transformer';
import type { AppRouter } from '~/api/trpc_router';
import { THEME_INIT_SCRIPT, ThemeProvider } from '~/components/theme-provider';
import Header from '@/components/Header';
import { Toaster } from '@/components/ui/sonner';
import { getUserSession$ } from '~/lib/get_auth_from_cookie';
import { AppContextProvider } from '@/components/AppDataContext';
import { robotoSans } from '~/components/fonts';
import { cn } from '~/lib/utils';
import { makeQueryClient } from '~/state/queryClient';
import PosthogInit from '~/components/tags/PosthogInit';

export const Route = createRootRoute({
  beforeLoad: async () => {
    const session = await getUserSession$();
    return {
      session
    };
  },
  ssr: true,
  head: () => ({
    meta: [
      {
        charSet: 'utf-8'
      },
      {
        name: 'viewport',
        content:
          'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'
      }
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss
      },
      {
        rel: 'icon',
        href: '/favicon.ico'
      },
      {
        rel: 'apple-touch-icon',
        href: '/favicon.ico'
      }
    ]
  }),

  shellComponent: RootDocument,
  notFoundComponent: () => <div>Not Found</div>
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn('dark', 'font-sans')}
      style={{ colorScheme: 'dark' }}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        // ^ this fixes flickering on initial page load
        <HeadContent />
      </head>
      <body
        className={cn(
          robotoSans.className,
          'antialiased',
          'overflow-y-scroll sm:px-2 lg:px-3 xl:px-4 2xl:px-4'
        )}
      >
        <RootProviders>{children}</RootProviders>
        <PosthogInit />
        <Scripts />
      </body>
    </html>
  );
}

function RootProviders({ children }: { children: React.ReactNode }) {
  const { session } = Route.useRouteContext();

  const [queryClient] = useState(() => makeQueryClient());
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
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
          <AppContextProvider initialSession={session}>
            <div className="container mx-auto mb-12">
              <Toaster richColors={true} />
              <Header />
              {children}
            </div>
            {import.meta.env.DEV && (
              <TanStackDevtools
                config={{
                  position: 'bottom-right',
                  openHotkey: undefined
                }}
                plugins={[
                  {
                    name: 'Tanstack Router',
                    render: <TanStackRouterDevtoolsPanel />
                  },
                  {
                    name: 'Tanstack Query',
                    render: <ReactQueryDevtoolsPanel />
                  }
                ]}
              />
            )}
          </AppContextProvider>
        </TRPCProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
