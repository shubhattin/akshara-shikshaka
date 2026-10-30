import { createFileRoute } from '@tanstack/react-router';
import { ReviewQueue } from '~/components/pages/agents/gesture_hub/ReviewQueue';

export const Route = createFileRoute('/admin/agents/queue')({
  component: ReviewQueue
});
