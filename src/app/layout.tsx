import './globals.css';
import './app.scss';
import { ThemeProvider } from '@/components/theme-provider';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/sonner';
import { Metadata, Viewport } from 'next';
import TRPCProvider from '~/api/TRPCProvider';
import { getCachedSession } from '~/lib/cache_server_route_data';
import { AppContextProvider } from '~/components/AppDataContext';
import { robotoSans } from '~/components/fonts';
import AppBar from '~/components/app-bar/AppBar';

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getCachedSession();

  return (
    <html lang="en" suppressHydrationWarning className="dark" style={{ colorScheme: 'dark' }}>
      <body
        className={cn(
          robotoSans.className,
          'antialiased',
          'overflow-y-scroll sm:px-2 lg:px-3 xl:px-4 2xl:px-4'
        )}
      >
        <ThemeProvider
          attribute={['class']}
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TRPCProvider>
            <AppContextProvider initialSession={session}>
              <div className="container mx-auto mb-12">
                <Toaster richColors={true} />
                <AppBar title="Akshara Shikshaka" />
                {children}
              </div>
            </AppContextProvider>
          </TRPCProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

// export const runtime = 'edge';

export const metadata: Metadata = {
  icons: {
    icon: '/favicon.ico',
    apple: '/favicon.ico'
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover'
};

export const dynamic = 'force-dynamic';
