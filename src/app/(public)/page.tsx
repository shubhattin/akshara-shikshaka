import type { Metadata } from 'next';
import Landing from './Landing';

export default function page() {
  return <Landing />;
}
export const metadata: Metadata = {
  title: 'Akshara Shikshaka - Master Sanskrit in Multiple Indian Scripts',
  description:
    'Learn to write and read Sanskrit across multiple Indian scripts including Devanagari, Telugu, Kannada, Malayalam, and more. Interactive lessons with authentic pronunciations and guided hand gestures.'
};
