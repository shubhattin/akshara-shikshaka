import type { IconType } from 'react-icons';
import { Link } from '@tanstack/react-router';
import { FaBookOpen, FaChartBar, FaRegHandPaper, FaRegImage, FaVolumeUp } from 'react-icons/fa';
import { IoMdArrowRoundBack } from 'react-icons/io';
import { cn } from '~/lib/utils';

type AdminDestination = {
  to: '/lessons' | '/gestures' | '/analytics' | '/image_assets' | '/audio_assets';
  label: string;
  description: string;
  icon: IconType;
  iconClass: string;
  hoverClass: string;
};

const destinations: AdminDestination[] = [
  {
    to: '/lessons',
    label: 'Lessons',
    description: 'Create and organize text lessons by language and category.',
    icon: FaBookOpen,
    iconClass: 'from-amber-400 to-orange-500',
    hoverClass: 'hover:border-amber-400'
  },
  {
    to: '/gestures',
    label: 'Gestures',
    description: 'Manage guided hand-gesture traces used in writing practice.',
    icon: FaRegHandPaper,
    iconClass: 'from-emerald-400 to-teal-500',
    hoverClass: 'hover:border-emerald-400'
  },
  {
    to: '/analytics',
    label: 'Analytics',
    description: 'Review gesture practice volume and learner trends.',
    icon: FaChartBar,
    iconClass: 'from-sky-400 to-blue-500',
    hoverClass: 'hover:border-sky-400'
  },
  {
    to: '/image_assets',
    label: 'Images',
    description: 'Upload and manage images used in lessons and practice.',
    icon: FaRegImage,
    iconClass: 'from-purple-400 to-indigo-500',
    hoverClass: 'hover:border-purple-400'
  },
  {
    to: '/audio_assets',
    label: 'Audio',
    description: 'Upload and manage pronunciation audio for letters and words.',
    icon: FaVolumeUp,
    iconClass: 'from-cyan-400 to-blue-500',
    hoverClass: 'hover:border-cyan-400'
  }
];

export default function AdminPage() {
  return (
    <div className="container mx-auto p-4">
      <div className="my-2 mb-4 px-2">
        <Link to="/" className="flex items-center gap-1 text-lg font-semibold">
          <IoMdArrowRoundBack className="inline-block text-xl" />
          Home Page
        </Link>
      </div>

      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-2 py-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
            Admin
          </h1>
          <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-300">
            Manage lessons, gestures, analytics, and media for Akshara Shikshaka.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {destinations.map((destination) => {
            const Icon = destination.icon;
            return (
              <Link
                key={destination.to}
                to={destination.to}
                className={cn(
                  'flex items-start gap-4 rounded-xl border-2 border-slate-200 bg-white p-5 no-underline transition-all',
                  'hover:shadow-xl dark:border-slate-700 dark:bg-slate-800',
                  destination.hoverClass
                )}
              >
                <div
                  className={cn(
                    'flex size-12 shrink-0 items-center justify-center rounded-xl bg-linear-to-br text-white shadow-lg',
                    destination.iconClass
                  )}
                >
                  <Icon className="text-xl" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                    {destination.label}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {destination.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
