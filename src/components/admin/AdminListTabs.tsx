import { Link } from '@tanstack/react-router';
import { cn } from '~/lib/utils';

const TABS = [
  { key: 'lessons', to: '/lessons', label: 'Lessons' },
  { key: 'gestures', to: '/gestures', label: 'Gestures' }
] as const;

/** Segmented-control tabs to jump between the Lessons and Gestures admin lists */
export function AdminListTabs({
  active,
  category
}: {
  active: (typeof TABS)[number]['key'];
  /** current `?category=`, carried across so both lists stay on the same lesson category */
  category?: number;
}) {
  return (
    <div
      className="flex items-center rounded-lg border bg-background p-0.5"
      role="tablist"
      aria-label="Lessons and gestures"
    >
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          to={tab.to}
          search={(prev) => ({ ...prev, category })}
          role="tab"
          aria-selected={active === tab.key}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            active === tab.key
              ? 'bg-secondary text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
