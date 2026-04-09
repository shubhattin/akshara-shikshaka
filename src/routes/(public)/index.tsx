import { createFileRoute } from '@tanstack/react-router';
import Landing from '~/components/pages/home/Landing';

export const Route = createFileRoute('/(public)/')({
  component: PublicIndex,
  head: () => ({
    meta: [
      {
        title: 'Akshara Shikshaka - Master Sanskrit in Multiple Indian Scripts'
      },
      {
        name: 'description',
        content:
          'Learn to write and read Sanskrit across multiple Indian scripts including Devanagari, Telugu, Kannada, Malayalam, and more. Interactive lessons with authentic pronunciations and guided hand gestures.'
      },
      {
        name: 'keywords',
        content:
          'Sanskrit, learning, scripts, akshara, varnas, Devanagari, Telugu, Kannada, Malayalam, Gujarati, Bengali, Odia, Indian scripts'
      }
    ]
  })
});

function PublicIndex() {
  return <Landing />;
}
