import { createFileRoute, notFound } from '@tanstack/react-router';
import { BatchPage } from '~/components/pages/agents/batches/BatchPage';

export const Route = createFileRoute('/admin/agents/batches/$batchId')({
  params: {
    parse: ({ batchId }) => {
      const id = Number(batchId);
      if (!Number.isInteger(id) || id <= 0) throw notFound();
      return { batchId: String(id) };
    }
  },
  component: RouteComponent
});

function RouteComponent() {
  const { batchId } = Route.useParams();
  return <BatchPage key={batchId} batchId={Number(batchId)} />;
}
