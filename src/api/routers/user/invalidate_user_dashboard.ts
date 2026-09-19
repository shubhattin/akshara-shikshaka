'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '~/api/client';

/**
 * Mark `user.get_dashboard` stale without refetching now.
 * The chip and dashboard page fetch on next open/visit.
 */
export function useInvalidateUserDashboard() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return () =>
    queryClient.invalidateQueries({
      ...trpc.user.get_dashboard.queryFilter(),
      refetchType: 'none'
    });
}
