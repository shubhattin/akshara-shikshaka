import { Link } from '@tanstack/react-router';
import type { inferRouterOutputs } from '@trpc/server';
import { ArrowUpRight, Hand, ImageIcon, Info, MicIcon, TypeIcon, Volume2Icon } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import type { AppRouter } from '~/api/trpc_router';
import { Skeleton } from '~/components/ui/skeleton';
import { cn } from '~/lib/utils';
import { FONT_SCRIPTS } from '~/state/font_list';
import { script_list_obj, type script_list_type } from '~/state/lang_list';

export type LessonOverview =
  inferRouterOutputs<AppRouter>['text_lessons']['categories']['get_text_lessons_overview'][number];

const SCRIPTS = FONT_SCRIPTS.map((name) => ({
  name,
  short: name.slice(0, 3),
  // SAFETY: enum lookup validated - key is from controlled enum list.
  id: script_list_obj[name as script_list_type]
}));

type GestureState = 'recorded' | 'empty' | 'missing';

function gestureState(overview: LessonOverview, script_id: number) {
  const gesture = overview.gestures.find((g) => g.script_id === script_id);
  const state: GestureState = !gesture
    ? 'missing'
    : gesture.stroke_count > 0
      ? 'recorded'
      : 'empty';
  return { gesture, state };
}

const GESTURE_STATE_DOT = {
  recorded: 'bg-emerald-500',
  empty: 'bg-amber-500',
  missing: 'border border-dashed border-muted-foreground/60'
} satisfies Record<GestureState, string>;

const GESTURE_STATE_LABEL = {
  recorded: 'Recorded',
  empty: 'No strokes',
  missing: 'Not linked'
} satisfies Record<GestureState, string>;

/** Recorded gestures out of all scripts; the per-script details open from the info button */
function GestureCoverage({ overview }: { overview: LessonOverview }) {
  const states = SCRIPTS.map((script) => ({ script, ...gestureState(overview, script.id) }));
  const recorded = states.filter((s) => s.state === 'recorded').length;
  return (
    <div className="flex items-center gap-1 text-xs">
      <span
        title="Scripts with a recorded gesture"
        className={cn(
          'flex items-center gap-1 tabular-nums',
          recorded === SCRIPTS.length ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        <Hand className="size-3.5" />
        {recorded}/{SCRIPTS.length}
      </span>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Gestures by script"
              className="text-muted-foreground"
            />
          }
        >
          <Info />
        </PopoverTrigger>
        <PopoverContent className="w-60 gap-1 p-2" side="top">
          <div className="px-1.5 pb-1 text-xs font-semibold">Gestures by script</div>
          {states.map(({ script, gesture, state }) => {
            const row = (
              <>
                <span className={cn('size-2 shrink-0 rounded-full', GESTURE_STATE_DOT[state])} />
                <span className="font-medium">{script.name}</span>
                <span className="ml-auto text-muted-foreground tabular-nums">
                  {state === 'recorded'
                    ? `${gesture!.stroke_count} stroke${gesture!.stroke_count === 1 ? '' : 's'}`
                    : GESTURE_STATE_LABEL[state]}
                </span>
              </>
            );
            const className = 'flex items-center gap-2 rounded-md px-1.5 py-1 text-xs';
            return gesture ? (
              <Link
                key={script.id}
                to="/gestures/edit/$id"
                params={{ id: String(gesture.gesture_id) }}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(className, 'group/row hover:bg-accent')}
              >
                {row}
                <ArrowUpRight className="size-3 shrink-0 text-muted-foreground/50 transition-colors group-hover/row:text-muted-foreground" />
              </Link>
            ) : (
              <div key={script.id} className={className}>
                {row}
              </div>
            );
          })}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function Stat({
  icon: Icon,
  value,
  total,
  label
}: {
  icon: typeof ImageIcon;
  value: number;
  total?: number;
  label: string;
}) {
  const complete = total === undefined ? value > 0 : total > 0 && value === total;
  return (
    <span
      title={label}
      className={cn(
        'flex items-center gap-1 tabular-nums',
        complete ? 'text-foreground' : 'text-muted-foreground'
      )}
    >
      <Icon className="size-3.5" />
      {total === undefined ? value : `${value}/${total}`}
    </span>
  );
}

export type LessonCardItem = { id: number; text: string; order: number | null };

export function LessonCard({
  lesson,
  overview
}: {
  lesson: LessonCardItem;
  overview: LessonOverview | undefined;
}) {
  return (
    <div className="group/card flex min-w-0 flex-col gap-2.5 rounded-xl border bg-card p-3 shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
      <div className="flex min-w-0 items-start gap-2">
        {lesson.order !== null ? (
          <span className="mt-1 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-muted px-1 text-[11px] font-semibold text-muted-foreground tabular-nums">
            {lesson.order}
          </span>
        ) : null}
        <Link
          to="/lessons/edit/$id"
          params={{ id: String(lesson.id) }}
          className="min-w-0 truncate text-2xl leading-tight font-semibold group-hover/card:text-primary"
        >
          {lesson.text}
        </Link>
        <div className="ml-auto flex shrink-0 items-center gap-2 pt-1">
          {overview?.has_audio ? (
            <Volume2Icon
              className="size-4 text-sky-600 dark:text-sky-400"
              aria-label="Lesson has audio"
            />
          ) : null}
          {overview ? <GestureCoverage overview={overview} /> : null}
        </div>
      </div>

      {!overview ? (
        <>
          <Skeleton className="h-5 w-full" />
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <Stat icon={TypeIcon} value={overview.word_count} label="Words" />
            <Stat
              icon={ImageIcon}
              value={overview.words_with_image}
              total={overview.word_count}
              label="Words with an image"
            />
            <Stat
              icon={MicIcon}
              value={overview.words_with_audio}
              total={overview.word_count}
              label="Words with audio"
            />
          </div>
        </>
      )}
    </div>
  );
}

/** Totals for the shown lessons: words, media and recorded gestures per script */
export function LessonsOverviewSummary({
  lessonIds,
  overview
}: {
  lessonIds: number[];
  overview: Map<number, LessonOverview>;
}) {
  const rows = lessonIds.flatMap((id) => overview.get(id) ?? []);
  const total = lessonIds.length;
  const withWords = rows.filter((r) => r.word_count > 0).length;
  const withAudio = rows.filter((r) => r.has_audio || r.words_with_audio > 0).length;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <span>
          <span className="font-semibold tabular-nums">{total}</span>{' '}
          <span className="text-muted-foreground">lessons</span>
        </span>
        <span>
          <span className="font-semibold tabular-nums">{withWords}</span>{' '}
          <span className="text-muted-foreground">with words</span>
        </span>
        <span>
          <span className="font-semibold tabular-nums">{withAudio}</span>{' '}
          <span className="text-muted-foreground">with audio</span>
        </span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {SCRIPTS.map((script) => {
          const recorded = rows.filter(
            (r) => gestureState(r, script.id).state === 'recorded'
          ).length;
          return (
            <div
              key={script.id}
              className="flex items-center gap-1.5 text-[11px]"
              title={`${script.name}: ${recorded}/${total} gestures recorded`}
            >
              <span className="w-7 text-muted-foreground">{script.short}</span>
              <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${total ? (recorded / total) * 100 : 0}%` }}
                />
              </div>
              <span className="text-muted-foreground tabular-nums">
                {recorded}/{total}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
