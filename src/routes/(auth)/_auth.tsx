import { getUserSession$ } from '@/lib/get_auth_from_cookie';
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/(auth)/_auth')({
  component: AuthLayout,
  beforeLoad: async () => {
    const session = await getUserSession$();
    if (!session?.user || session.user.role !== 'admin') {
      throw redirect({ to: '/' });
      // handles redirects for the whole /(auth) route group
    }
    return {
      session
    };
  }
});

function AuthLayout() {
  return <Outlet />;
}
