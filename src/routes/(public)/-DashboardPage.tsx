'use client';

import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CheckCircle2, LayoutDashboard, PenLine, Percent, Sparkles, Target } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTRPC } from '~/api/client';
import type { AksharaDashboardStats } from '~/api/routers/user/user_dashboard';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Skeleton } from '~/components/ui/skeleton';
import { useSession } from '~/lib/auth-client';
import { get_script_from_id } from '~/state/lang_list';
import { cn } from '~/lib/utils';

function formatAccuracy(accuracy: number | null | undefined): string {
  if (accuracy == null || !Number.isFinite(accuracy)) return '—';
  return `${Math.round(accuracy)}%`;
}

function formatPlayedAt(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function scriptLabel(script_id: number): string {
  return get_script_from_id(script_id) ?? `Script ${script_id}`;
}

function DashboardPage() {
  const userName = useSession().data?.user?.name;
  const trpc = useTRPC();
  const dashboardQuery = useQuery(trpc.user.get_dashboard.queryOptions());

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 lg:px-6">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <span className="flex size-8 items-center justify-center rounded-lg bg-linear-to-br from-violet-500 to-indigo-600 text-white shadow-md shadow-violet-500/30">
            <LayoutDashboard className="size-4" />
          </span>
          {userName ? `Hi, ${userName}` : 'Your practice'}
        </h2>
        <p className="text-sm text-muted-foreground">
          Gesture practice stats from your signed-in recordings.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          render={<Link to="/learn" />}
          className="border-transparent bg-linear-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/25 hover:from-emerald-400 hover:to-teal-500 hover:text-white"
        >
          <PenLine data-icon="inline-start" />
          Continue practicing
        </Button>
      </div>

      {dashboardQuery.isLoading ? <DashboardSkeleton /> : null}
      {dashboardQuery.isError ? (
        <p className="py-8 text-center text-sm text-destructive">Failed to load dashboard stats</p>
      ) : null}
      {dashboardQuery.data ? <DashboardBody stats={dashboardQuery.data} /> : null}
    </div>
  );
}

function DashboardBody({ stats }: { stats: AksharaDashboardStats }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Practiced"
          value={String(stats.started)}
          icon={<PenLine className="size-3.5" />}
          iconClass="from-sky-500 to-blue-600 shadow-sky-500/25"
        />
        <StatCard
          label="Completed"
          value={String(stats.completed)}
          icon={<CheckCircle2 className="size-3.5" />}
          iconClass="from-emerald-500 to-teal-600 shadow-emerald-500/25"
        />
        <StatCard
          label="Completion"
          value={`${stats.completion_rate}%`}
          icon={<Percent className="size-3.5" />}
          iconClass="from-violet-500 to-indigo-600 shadow-violet-500/25"
        />
        <StatCard
          label="Best accuracy"
          value={formatAccuracy(stats.best_accuracy)}
          icon={<Target className="size-3.5" />}
          iconClass="from-fuchsia-500 to-pink-600 shadow-fuchsia-500/25"
        />
      </div>

      <Card className="overflow-hidden bg-linear-to-br from-blue-50/90 via-sky-50/40 to-indigo-50/80 dark:from-blue-950/50 dark:via-slate-900/30 dark:to-indigo-950/40">
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-linear-to-br from-blue-500 to-indigo-600 text-white shadow-sm shadow-blue-500/30">
              <Sparkles className="size-4" />
            </div>
            <div className="min-w-0">
              <CardTitle>Practice overview</CardTitle>
              <CardDescription>
                Avg accuracy {formatAccuracy(stats.avg_accuracy)} · {stats.started} recordings
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 pb-4">
          <GestureList
            title="Most practiced"
            empty="No recordings yet — start a lesson to build this list."
            items={stats.top_gestures.map((gesture) => ({
              key: `${gesture.script_id}::${gesture.text}`,
              title: gesture.text,
              meta: `${scriptLabel(gesture.script_id)} · ${gesture.completed}/${gesture.started} · ${formatAccuracy(gesture.avg_accuracy)}`
            }))}
          />
          <GestureList
            title="Recent activity"
            empty="No recent practice yet."
            items={stats.recent.map((row) => ({
              key: `recent-${row.id}`,
              title: row.text,
              meta: `${scriptLabel(row.script_id)} · ${row.completed ? 'Completed' : 'Started'} · ${formatAccuracy(row.avg_accuracy)} · ${formatPlayedAt(row.created_at)}`
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  iconClass
}: {
  label: string;
  value: string;
  icon: ReactNode;
  iconClass: string;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card
        size="sm"
        className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
      >
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-br text-white shadow-sm',
                iconClass
              )}
            >
              {icon}
            </div>
            <div className="min-w-0">
              <CardDescription>{label}</CardDescription>
              <CardTitle className="tabular-nums">{value}</CardTitle>
            </div>
          </div>
        </CardHeader>
      </Card>
    </motion.div>
  );
}

function GestureList({
  title,
  empty,
  items
}: {
  title: string;
  empty: string;
  items: Array<{ key: string; title: string; meta: string }>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => (
            <li
              key={item.key}
              className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm transition-all duration-200 hover:translate-x-0.5 hover:bg-muted"
            >
              <span className="truncate font-medium">{item.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {item.meta}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={`dash-stat-${index}`} className="h-20 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

export default DashboardPage;
