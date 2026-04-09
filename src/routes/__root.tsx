import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools';
import { TanStackDevtools } from '@tanstack/react-devtools';

import appCss from '../styles.css?url';
import '../app.scss?url';
import TRPCProvider from '~/api/TRPCProvider';
import { ThemeProvider } from '~/components/theme-provider';
import Header from '@/components/Header';
import { Toaster } from '@/components/ui/sonner';
import { getUserSession$ } from '~/lib/get_auth_from_cookie';
import { AppContextProvider } from '@/components/AppDataContext';
import { robotoSans } from '~/components/fonts';
import { cn } from '~/lib/utils';

export const Route = createRootRoute({
  beforeLoad: async () => {
    const session = await getUserSession$();
    return {
      session
    };
  },
  ssr: true,
  head: () => ({
    title: 'Akshara',
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
  const { session } = Route.useRouteContext();

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn('dark', 'font-sans')}
      style={{ colorScheme: 'dark' }}
    >
      <head>
        <HeadContent />
      </head>
      <body
        className={cn(
          robotoSans.className,
          'antialiased',
          'overflow-y-scroll sm:px-2 lg:px-3 xl:px-4 2xl:px-4'
        )}
      >
        <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
          <TRPCProvider>
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
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
