import { Link } from '@tanstack/react-router';
import { useAtomValue } from 'jotai';
import {
  BookOpen,
  Bot,
  Hand,
  LayoutDashboard,
  ListTree,
  PencilLine,
  ShieldCheck,
  Spline
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useSession } from '~/lib/auth-client';
import { cn } from '~/lib/utils';
import { learn_admin_context_atom } from '~/state/learn_admin_context';

const linkClass =
  'flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700/50';

/**
 * Admin entry in the app bar menu, only for admins: the admin dashboard (which links to every admin
 * page), the lessons, gestures and agents pages, and, on the learn page, editing what is shown there: the lesson, its gesture, its category.
 */
export function AdminMenuSection({ onNavigate }: { onNavigate: () => void }) {
  const session = useSession();
  const learn = useAtomValue(learn_admin_context_atom);
  if (session.data?.user.role !== 'admin') return null;

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Admin</span>
        </div>

        {learn && (learn.lesson || learn.category) ? (
          <div className="space-y-1.5">
            {learn.lesson ? (
              <Link
                to="/lessons/edit/$id"
                params={{ id: String(learn.lesson.id) }}
                onClick={onNavigate}
                className={cn(
                  linkClass,
                  'border-sky-500/40 bg-sky-50 text-sky-800 dark:border-sky-400/40 dark:bg-sky-950/40 dark:text-sky-200'
                )}
              >
                <PencilLine className="size-4" />
                <span>
                  Edit Current Lesson <span className="font-semibold">{learn.lesson.text}</span>
                </span>
                <span className="ml-auto text-slate-500 tabular-nums dark:text-slate-400">
                  #{learn.lesson.id}
                </span>
              </Link>
            ) : null}
            {learn.gesture_id !== null ? (
              <Link
                to="/gestures/edit/$id"
                params={{ id: String(learn.gesture_id) }}
                onClick={onNavigate}
                className={linkClass}
              >
                <Hand className="size-4" />
                Edit Current Gesture
                <span className="ml-auto text-slate-500 tabular-nums dark:text-slate-400">
                  #{learn.gesture_id}
                </span>
              </Link>
            ) : null}
            {learn.category ? (
              <Link
                to="/lessons"
                search={{ category: learn.category.id }}
                onClick={onNavigate}
                className={linkClass}
              >
                <ListTree className="size-4" />
                Edit {learn.category.name}
              </Link>
            ) : null}
          </div>
        ) : null}

        <Link to="/admin" onClick={onNavigate} className={linkClass}>
          <LayoutDashboard className="size-4" />
          Admin Dashboard
        </Link>
        <div className="grid grid-cols-3 gap-1.5">
          <Link to="/lessons" onClick={onNavigate} className={cn(linkClass, 'justify-center')}>
            <BookOpen className="size-4" />
            Lessons
          </Link>
          <Link to="/gestures" onClick={onNavigate} className={cn(linkClass, 'justify-center')}>
            <Spline className="size-4" />
            Gestures
          </Link>
          <Link to="/admin/agents" onClick={onNavigate} className={cn(linkClass, 'justify-center')}>
            <Bot className="size-4" />
            Agents
          </Link>
        </div>
      </div>
      <Separator className="my-4 bg-slate-200 dark:bg-slate-700" />
    </>
  );
}
