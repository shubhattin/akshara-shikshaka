import { createFileRoute, notFound } from '@tanstack/react-router';
import { GestureHub } from '~/components/pages/agents/gesture_hub/GestureHub';

export const Route = createFileRoute('/admin/agents/gestures/$gestureId')({
  params: {
    parse: ({ gestureId }) => {
      const id = Number(gestureId);
      if (!Number.isInteger(id) || id <= 0) throw notFound();
      return { gestureId: String(id) };
    }
  },
  component: RouteComponent
});

function RouteComponent() {
  const { gestureId } = Route.useParams();
  return <GestureHub key={gestureId} gestureId={Number(gestureId)} />;
}
