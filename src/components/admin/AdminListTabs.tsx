import { Link } from '@tanstack/react-router';
import { BookOpenIcon, BotIcon, SplineIcon } from 'lucide-react';
import { cn } from '~/lib/utils';

type ListTab = 'lessons' | 'gestures';

const tabClass = (active: boolean) =>
  cn(
    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium no-underline transition-colors',
    active
      ? 'bg-secondary text-foreground shadow-xs'
      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
  );

/** Segmented control to jump between the three main admin pages: Lessons, Gestures and Agents */
export function AdminListTabs({
  active,
  category
}: {
  active: ListTab;
  /** current `?category=`, carried across so both lists stay on the same lesson category */
  category?: number;
}) {
  return (
    <nav
      className="flex items-center gap-0.5 rounded-lg border bg-background p-0.5"
      aria-label="Admin pages"
    >
      <Link
        to="/lessons"
        search={(prev) => ({ ...prev, category })}
        aria-current={active === 'lessons' ? 'page' : undefined}
        className={tabClass(active === 'lessons')}
      >
        <BookOpenIcon className="size-4" />
        Lessons
      </Link>
      <Link
        to="/gestures"
        search={(prev) => ({ ...prev, category })}
        aria-current={active === 'gestures' ? 'page' : undefined}
        className={tabClass(active === 'gestures')}
      >
        <SplineIcon className="size-4" />
        Gestures
      </Link>
      <Link to="/admin/agents" className={tabClass(false)}>
        <BotIcon className="size-4" />
        Agents
      </Link>
    </nav>
  );
}
