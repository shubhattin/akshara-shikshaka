import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools';
import { TanStackDevtools } from '@tanstack/react-devtools';
import { QueryClientProvider } from '@tanstack/react-query';

import appCss from '../styles.css?url';
import '../app.scss?url';
import { ThemeProvider } from '~/components/theme-provider';
import Header from '@/components/Header';
import { queryClient } from '~/state/queryClient';
import { Toaster } from '@/components/ui/sonner';
import { getUserSession$ } from '~/lib/get_auth_from_cookie';
import { AppContextProvider } from '@/components/AppDataContext';

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
        content: 'width=device-width, initial-scale=1'
      },
      {
        title: 'Sora2 Video Generator'
      }
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss
      }
    ]
  }),

  shellComponent: RootDocument,
  notFoundComponent: () => <div>Not Found</div>
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const { session } = Route.useRouteContext();

  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="overflow-y-scroll antialiased sm:px-2 lg:px-3 xl:px-4 2xl:px-4">
        <QueryClientProvider client={queryClient}>
          <AppContextProvider initialSession={session}>
            <Header />
            <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
              <Toaster richColors={true} />
              <div className="container mx-auto mb-4">{children}</div>
            </ThemeProvider>
          </AppContextProvider>
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
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
