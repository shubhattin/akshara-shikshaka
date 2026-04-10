import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/(auth)/_auth')({
  component: AuthLayout,
  beforeLoad: async ({ context }) => {
    const session = context.session;
    if (!session?.user || session.user.role !== 'admin') {
      throw redirect({ to: '/' });
      // handles redirects for the whole /(auth) route group
    }
  }
});

function AuthLayout() {
  return <Outlet />;
}
