import { createFileRoute } from '@tanstack/react-router';
import { BatchList } from '~/components/pages/agents/batches/BatchList';

export const Route = createFileRoute('/admin/agents/batches/')({
  component: BatchList
});
