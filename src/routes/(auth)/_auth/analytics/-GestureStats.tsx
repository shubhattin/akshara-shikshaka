'use client';

import { useState, useMemo, type ComponentType } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '~/api/client';
import { Calendar } from '~/components/ui/calendar';
import { Button } from '~/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { Skeleton } from '~/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { Card, CardContent, CardHeader } from '~/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '~/components/ui/chart';
import { XAxis, YAxis, CartesianGrid, AreaChart, Area, BarChart, Bar } from 'recharts';
import {
  CalendarIcon,
  TrendingUpIcon,
  UsersIcon,
  HashIcon,
  CheckCircle2Icon,
  CrosshairIcon,
  TrophyIcon
} from 'lucide-react';
import { cn } from '~/lib/utils';
import { get_script_from_id, SCRIPT_LIST, script_list_obj } from '~/state/lang_list';
import GestureSelector, { type SelectedGesture } from './-GestureSelector';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '~/components/ui/accordion';

type DateRange = {
  from: Date | undefined;
  to: Date | undefined;
};

type PeriodType = 'all_time' | 'last_week' | 'last_month' | 'last_3_months' | 'custom';
type CompletionFilter = 'all' | 'completed' | 'incomplete';
type ChartType = 'started-completed' | 'avg-accuracy' | 'avg-attempts' | 'script' | 'text';

const PERIOD_ITEMS = [
  { label: 'All Time', value: 'all_time' as const },
  { label: 'Last Week', value: 'last_week' as const },
  { label: 'Last Month', value: 'last_month' as const },
  { label: 'Last 3 Months', value: 'last_3_months' as const },
  { label: 'Custom Range', value: 'custom' as const }
];

const COMPLETION_ITEMS = [
  { label: 'All', value: 'all' as const },
  { label: 'Completed', value: 'completed' as const },
  { label: 'Incomplete', value: 'incomplete' as const }
];

const CHART_TYPE_ITEMS = [
  { label: 'Started and Completed', value: 'started-completed' as const },
  { label: 'Average Accuracy', value: 'avg-accuracy' as const },
  { label: 'Average Attempts', value: 'avg-attempts' as const },
  { label: 'Script', value: 'script' as const },
  { label: 'Text', value: 'text' as const }
];

const MAX_CHART_POINTS = 28;
const MAX_TEXT_BARS = 12;

const SCRIPT_FILTER_ITEMS: { label: string; value: string }[] = [
  { label: 'All scripts', value: 'all' },
  ...SCRIPT_LIST.map((script) => ({
    label: script,
    // SAFETY: enum lookup validated - key is from controlled SCRIPT_LIST.
    value: String(script_list_obj[script as keyof typeof script_list_obj])
  }))
];

// --- Date helpers (no external date lib) ---

function toDateKey(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function subWeeks(d: Date, weeks: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - weeks * 7);
  return copy;
}

function subMonths(d: Date, months: number): Date {
  const copy = new Date(d);
  const day = copy.getDate();
  copy.setMonth(copy.getMonth() - months);
  // clamp end-of-month overflow (e.g. Mar 31 -> Feb 28)
  if (copy.getDate() !== day) copy.setDate(0);
  return copy;
}

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
];

function formatAxisLabel(d: Date): string {
  return `${MONTHS_SHORT[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}`;
}

function formatTooltipLabel(d: Date, showYear: boolean): string {
  const base = formatAxisLabel(d);
  return showYear ? `${base}, ${d.getFullYear()}` : base;
}

function scriptLabel(script_id: number): string {
  return get_script_from_id(script_id) ?? `Script ${script_id}`;
}

function yearFromDateKey(dateKey: string): number {
  return Number(dateKey.slice(0, 4));
}

function shouldShowYearInTooltip(
  allTime: boolean,
  range: { from: Date; to: Date } | null,
  dateKeys: string[]
): boolean {
  if (allTime) return true;
  if (range && range.from.getFullYear() !== range.to.getFullYear()) return true;
  if (dateKeys.length >= 2) {
    return yearFromDateKey(dateKeys[0]) !== yearFromDateKey(dateKeys[dateKeys.length - 1]);
  }
  return false;
}

function buildDateLabels(
  dateStr: string,
  endDateStr: string | undefined,
  showYearInTooltip: boolean
) {
  const end = endDateStr ?? dateStr;
  const startDate = parseDateKey(dateStr);
  const endDate = parseDateKey(end);
  const label =
    dateStr === end
      ? formatAxisLabel(startDate)
      : `${formatAxisLabel(startDate)} – ${formatAxisLabel(endDate)}`;
  const tooltipLabel =
    dateStr === end
      ? formatTooltipLabel(startDate, showYearInTooltip)
      : `${formatTooltipLabel(startDate, showYearInTooltip)} – ${formatTooltipLabel(endDate, showYearInTooltip)}`;
  return { label, tooltipLabel, endDate: end };
}

function bucketDailyStats(
  dailyStats: DailyStatPoint[],
  showYearInTooltip: boolean
): DailyStatPoint[] {
  if (dailyStats.length <= MAX_CHART_POINTS) return dailyStats;

  const bucketSize = Math.ceil(dailyStats.length / MAX_CHART_POINTS);
  const buckets: DailyStatPoint[] = [];

  for (let i = 0; i < dailyStats.length; i += bucketSize) {
    const chunk = dailyStats.slice(i, i + bucketSize);
    const started = chunk.reduce((sum, d) => sum + d.started, 0);
    const completed = chunk.reduce((sum, d) => sum + d.completed, 0);
    const totalAccuracyWeighted = chunk.reduce((sum, d) => sum + d.totalAccuracyWeighted, 0);
    const totalVectors = chunk.reduce((sum, d) => sum + d.totalVectors, 0);
    const { label, tooltipLabel, endDate } = buildDateLabels(
      chunk[0].date,
      chunk[chunk.length - 1].date,
      showYearInTooltip
    );

    buckets.push({
      date: chunk[0].date,
      endDate,
      label,
      tooltipLabel,
      started,
      completed,
      totalAccuracyWeighted,
      totalVectors,
      avgAccuracy: totalVectors > 0 ? Math.round(totalAccuracyWeighted / totalVectors) : 0,
      avgAttempts: started > 0 ? totalVectors / started : 0
    });
  }

  return buckets;
}

const DEFAULT_CHART_CONFIG = {
  started: {
    label: 'Started',
    color: 'hsl(217 91% 60%)'
  },
  completed: {
    label: 'Completed',
    color: 'hsl(240 100% 70%)'
  },
  avgAccuracy: {
    label: 'Avg Accuracy (%)',
    color: 'hsl(30 100% 50%)'
  },
  avgAttempts: {
    label: 'Avg Attempts',
    color: 'hsl(120 100% 40%)'
  },
  frequency: {
    label: 'Frequency',
    color: 'hsl(170 100% 45%)'
  }
};

type ChartDataType = {
  dailyStats: DailyStatPoint[];
  scriptFrequency: {
    name: string;
    frequency: number;
  }[];
  textFrequency: {
    name: string;
    frequency: number;
  }[];
  isBucketed: boolean;
};

type DailyStatPoint = {
  date: string;
  endDate: string;
  label: string;
  tooltipLabel: string;
  started: number;
  completed: number;
  totalAccuracyWeighted: number;
  totalVectors: number;
  avgAccuracy: number;
  avgAttempts: number;
};

// Custom tooltip for started-completed chart
const StartedCompletedTooltip = ({
  active,
  payload
}: {
  active?: boolean;
  payload?: { payload: DailyStatPoint }[];
}) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const started = data.started || 0;
    const completed = data.completed || 0;
    const completionRate = started > 0 ? Math.round((completed / started) * 100) : 0;

    return (
      <div className="rounded-lg border bg-background p-2 shadow-md">
        <div className="grid gap-2">
          <div className="flex flex-col">
            <span className="text-[0.70rem] text-muted-foreground uppercase">
              {data.tooltipLabel}
            </span>
          </div>
          <div className="grid gap-1">
            <div className="flex items-center gap-2">
              <div
                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: 'hsl(210, 100%, 45%)' }}
              />
              <span className="text-sm">Started: {started}</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: 'hsl(140, 70%, 40%)' }}
              />
              <span className="text-sm">Completed: {completed}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 border-t pt-1">
              <span className="text-sm font-medium">Completion Rate: {completionRate}%</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

// Custom tooltip for average accuracy chart
const AvgAccuracyTooltip = ({
  active,
  payload
}: {
  active?: boolean;
  payload?: { payload: DailyStatPoint }[];
}) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;

    return (
      <div className="rounded-lg border bg-background p-2 shadow-md">
        <div className="grid gap-2">
          <div className="flex flex-col">
            <span className="text-[0.70rem] text-muted-foreground uppercase">
              {data.tooltipLabel}
            </span>
          </div>
          <div className="grid gap-1">
            <div className="flex items-center gap-2">
              <div
                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: 'hsl(30 100% 50%)' }}
              />
              <span className="text-sm">Average Accuracy: {data.avgAccuracy}%</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

// Custom tooltip for average attempts chart
const AvgAttemptsTooltip = ({
  active,
  payload
}: {
  active?: boolean;
  payload?: { payload: DailyStatPoint }[];
}) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;

    return (
      <div className="rounded-lg border bg-background p-2 shadow-md">
        <div className="grid gap-2">
          <div className="flex flex-col">
            <span className="text-[0.70rem] text-muted-foreground uppercase">
              {data.tooltipLabel}
            </span>
          </div>
          <div className="grid gap-1">
            <div className="flex items-center gap-2">
              <div
                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: 'hsl(120 100% 40%)' }}
              />
              <span className="text-sm">
                Average Attempts: {data.avgAttempts.toFixed(1)} strokes
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

// Main component
type GestureStatsProps = {
  gestureText?: string;
  gestureScriptId?: number;
};

type StatsContentBodyProps = {
  topGestures: TopGestureRow[];
  topGesturesLoading: boolean;
  topUsers: TopUserRow[];
  topUsersLoading: boolean;
  summaryStats: ReturnType<typeof computeSummaryStats>;
  chartData: ChartDataType;
  chartType: ChartType;
  setChartType: (chartType: ChartType) => void;
};

const StatsContentBody = ({
  topGestures,
  topGesturesLoading,
  topUsers,
  topUsersLoading,
  summaryStats,
  chartData,
  chartType,
  setChartType
}: StatsContentBodyProps) => {
  if (!summaryStats) return null;

  return (
    <>
      <div className="flex flex-col gap-3">
        <TopGesturesLeader gestures={topGestures} isLoading={topGesturesLoading} />
        <TopUsersLeader users={topUsers} isLoading={topUsersLoading} />
      </div>
      {/* Summary Cards */}
      <SummaryCards summaryStats={summaryStats} />

      {summaryStats.totalStarted === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No data available for the selected time period
        </p>
      ) : (
        <ChartsSection
          chartData={chartData}
          chartConfig={DEFAULT_CHART_CONFIG}
          chartType={chartType}
          setChartType={setChartType}
        />
      )}
    </>
  );
};

type ResolvedRange = { from: Date; to: Date } | null;

function defaultDateRange(): DateRange {
  const today = endOfDay(new Date());
  const monthsAgo = startOfDay(subMonths(today, 3));
  return { from: monthsAgo, to: today };
}

function initialSelectedGestures(
  gestureText?: string,
  gestureScriptId?: number
): SelectedGesture[] {
  return gestureText && gestureScriptId !== undefined
    ? [{ text: gestureText, script_id: gestureScriptId }]
    : [];
}

function resolvePeriodRange(period: PeriodType, dateRange: DateRange): ResolvedRange {
  const today = endOfDay(new Date());
  if (period === 'all_time') return null;
  if (period === 'last_week') return { from: startOfDay(subWeeks(today, 1)), to: today };
  if (period === 'last_month') return { from: startOfDay(subMonths(today, 1)), to: today };
  if (period === 'last_3_months') return { from: startOfDay(subMonths(today, 3)), to: today };
  return dateRange.from && dateRange.to
    ? { from: startOfDay(dateRange.from), to: endOfDay(dateRange.to) }
    : null;
}

function statsRangeEnabled(allTime: boolean, range: ResolvedRange): boolean {
  return allTime || !!(range?.from && range?.to);
}

function selectionLabel(selectedGestures: SelectedGesture[], scriptFilter: string): string {
  if (selectedGestures.length === 0) {
    if (scriptFilter !== 'all')
      return `Analytics for ${scriptLabel(Number(scriptFilter))} gestures`;
    return 'Analytics across all gestures';
  }
  if (selectedGestures.length === 1) {
    const g = selectedGestures[0];
    return `Analytics for ${g.text} (${scriptLabel(g.script_id)})`;
  }
  return `Analytics for ${selectedGestures.length} selected gestures`;
}

type RecordingPoint = {
  id: number;
  created_at: Date | string;
  completed: boolean;
  text: string;
  script_id: number;
};

type VectorStatPoint = {
  recording_id: number;
  avg_accuracy: number;
  vector_count: number;
};

type DailyBucketTotals = {
  date: string;
  started: number;
  completed: number;
  totalAccuracyWeighted: number;
  totalVectors: number;
};

function emptyDailyBucket(dateKey: string): DailyBucketTotals {
  return {
    date: dateKey,
    started: 0,
    completed: 0,
    totalAccuracyWeighted: 0,
    totalVectors: 0
  };
}

function buildDailyStats(
  recordings: RecordingPoint[],
  vectorByRecording: Map<number, VectorStatPoint>,
  allTime: boolean,
  effectiveDateRange: ResolvedRange
): DailyStatPoint[] {
  // Create daily aggregation
  const dailyMap = new Map<string, DailyBucketTotals>();

  for (const recording of recordings) {
    const dateKey = toDateKey(new Date(recording.created_at));
    const existing = dailyMap.get(dateKey) ?? emptyDailyBucket(dateKey);
    existing.started += 1;
    if (recording.completed) existing.completed += 1;
    const vectors = vectorByRecording.get(recording.id);
    if (vectors) {
      existing.totalAccuracyWeighted += vectors.avg_accuracy * vectors.vector_count;
      existing.totalVectors += vectors.vector_count;
    }
    dailyMap.set(dateKey, existing);
  }

  // Calculate averages for each day
  const dailyStatsRaw = Array.from(dailyMap.values())
    .map((day) => ({
      ...day,
      endDate: day.date,
      label: '',
      tooltipLabel: '',
      avgAccuracy:
        day.totalVectors > 0 ? Math.round(day.totalAccuracyWeighted / day.totalVectors) : 0,
      avgAttempts: day.started > 0 ? day.totalVectors / day.started : 0
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const showYearInTooltip = shouldShowYearInTooltip(
    allTime,
    effectiveDateRange,
    dailyStatsRaw.map((d) => d.date)
  );

  return bucketDailyStats(
    dailyStatsRaw.map((day) => {
      const { label, tooltipLabel, endDate } = buildDateLabels(
        day.date,
        day.endDate,
        showYearInTooltip
      );
      return { ...day, endDate, label, tooltipLabel };
    }),
    showYearInTooltip
  );
}

// Calculate script frequency
function buildScriptFrequency(recordings: RecordingPoint[]): { name: string; frequency: number }[] {
  const scriptMap = new Map<string, number>();
  for (const recording of recordings) {
    const name = scriptLabel(recording.script_id);
    const count = scriptMap.get(name) ?? 0;
    scriptMap.set(name, count + 1);
  }
  return Array.from(scriptMap.entries())
    .map(([name, frequency]) => ({ name, frequency }))
    .sort((a, b) => b.frequency - a.frequency);
}

// Calculate text frequency (top texts by submissions)
function buildTextFrequency(recordings: RecordingPoint[]): { name: string; frequency: number }[] {
  const textMap = new Map<string, number>();
  for (const recording of recordings) {
    const count = textMap.get(recording.text) ?? 0;
    textMap.set(recording.text, count + 1);
  }
  return Array.from(textMap.entries())
    .map(([name, frequency]) => ({ name, frequency }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, MAX_TEXT_BARS);
}

function computeChartData(
  recordings: RecordingPoint[] | null,
  vectorByRecording: Map<number, VectorStatPoint>,
  allTime: boolean,
  effectiveDateRange: ResolvedRange
): ChartDataType {
  if (!recordings) {
    return { dailyStats: [], scriptFrequency: [], textFrequency: [], isBucketed: false };
  }

  const dailyStats = buildDailyStats(recordings, vectorByRecording, allTime, effectiveDateRange);

  return {
    dailyStats,
    scriptFrequency: buildScriptFrequency(recordings),
    textFrequency: buildTextFrequency(recordings),
    isBucketed: dailyStats.length > MAX_CHART_POINTS
  };
}

function meanRound(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function recordingsOrNull(
  data: { recordings: RecordingPoint[] } | undefined
): RecordingPoint[] | null {
  return data ? data.recordings : null;
}

function gestureKeysOrUndefined(
  selectedGestures: SelectedGesture[]
): SelectedGesture[] | undefined {
  return selectedGestures.length > 0 ? selectedGestures : undefined;
}

function scriptIdsOrUndefined(scriptFilter: string): number[] | undefined {
  return scriptFilter !== 'all' ? [Number(scriptFilter)] : undefined;
}

function scriptIdOrUndefined(scriptFilter: string): number | undefined {
  return scriptFilter !== 'all' ? Number(scriptFilter) : undefined;
}

type GestureStatsQueryParams = {
  gestureKeys: SelectedGesture[] | undefined;
  scriptIds: number[] | undefined;
  scriptId: number | undefined;
  completion: CompletionFilter;
  allTime: boolean;
  from: Date | undefined;
  to: Date | undefined;
  range: ResolvedRange;
  enabled: boolean;
};

function useGestureStatsData(params: GestureStatsQueryParams) {
  const trpc = useTRPC();

  const statsQuery = useQuery(
    trpc.gesture_stats.get_stats_data.queryOptions(
      {
        gesture_keys: params.gestureKeys,
        script_ids: params.scriptIds,
        completion: params.completion,
        all_time: params.allTime,
        start_date: params.from,
        end_date: params.to
      },
      {
        enabled: params.enabled
      }
    )
  );

  const topGesturesQuery = useQuery(
    trpc.gesture_stats.get_top_gestures.queryOptions(
      {
        all_time: params.allTime,
        start_date: params.from,
        end_date: params.to,
        script_id: params.scriptId,
        limit: 10
      },
      {
        enabled: params.enabled
      }
    )
  );

  const topUsersQuery = useQuery(
    trpc.gesture_stats.get_top_users.queryOptions(
      {
        all_time: params.allTime,
        start_date: params.from,
        end_date: params.to,
        script_id: params.scriptId,
        limit: 10
      },
      {
        enabled: params.enabled
      }
    )
  );

  const vectorByRecording = useMemo(() => {
    const map = new Map<number, VectorStatPoint>();
    for (const v of statsQuery.data?.vector_stats ?? []) map.set(v.recording_id, v);
    return map;
  }, [statsQuery.data]);

  const recordings = recordingsOrNull(statsQuery.data);

  // Process data for charts
  const chartData = useMemo(
    () => computeChartData(recordings, vectorByRecording, params.allTime, params.range),
    [recordings, vectorByRecording, params.allTime, params.range]
  );

  const summaryStats = useMemo(
    () => computeSummaryStats(recordings, vectorByRecording),
    [recordings, vectorByRecording]
  );

  return { statsQuery, topGesturesQuery, topUsersQuery, chartData, summaryStats };
}

// Summary statistics
function computeSummaryStats(
  recordings: RecordingPoint[] | null,
  vectorByRecording: Map<number, VectorStatPoint>
) {
  if (!recordings) return null;

  const totalStarted = recordings.length;
  const totalCompleted = recordings.filter((r) => r.completed).length;
  const perRecording = recordings
    .map((r) => vectorByRecording.get(r.id))
    .filter((v) => v !== undefined);
  const totalVectors = perRecording.reduce((sum, v) => sum + v.vector_count, 0);
  const weightedAccuracy = perRecording.reduce(
    (sum, v) => sum + v.avg_accuracy * v.vector_count,
    0
  );

  return {
    totalStarted,
    totalCompleted,
    completionRate: totalStarted > 0 ? Math.round((totalCompleted / totalStarted) * 100) : 0,
    // vector-weighted mean accuracy across submissions
    avgAccuracy: totalVectors > 0 ? Math.round(weightedAccuracy / totalVectors) : 0,
    avgAttempts: totalStarted > 0 ? totalVectors / totalStarted : 0,
    // mean of per-recording averages (unweighted) — reserved for future display
    meanAccuracy: meanRound(perRecording.map((v) => v.avg_accuracy))
  };
}

const GestureStats = ({ gestureText, gestureScriptId }: GestureStatsProps) => {
  const [period, setPeriod] = useState<PeriodType>('last_3_months');
  const [completionFilter, setCompletionFilter] = useState<CompletionFilter>('all');
  const [scriptFilter, setScriptFilter] = useState<string>('all');
  const [chartType, setChartType] = useState<ChartType>('started-completed');
  const [selectedGestures, setSelectedGestures] = useState<SelectedGesture[]>(() =>
    initialSelectedGestures(gestureText, gestureScriptId)
  );
  const [dateRange, setDateRange] = useState<DateRange>(defaultDateRange);

  const effectiveDateRange = useMemo(
    () => resolvePeriodRange(period, dateRange),
    [period, dateRange]
  );

  const allTime = period === 'all_time';

  const { statsQuery, topGesturesQuery, topUsersQuery, chartData, summaryStats } =
    useGestureStatsData({
      gestureKeys: gestureKeysOrUndefined(selectedGestures),
      scriptIds: scriptIdsOrUndefined(scriptFilter),
      scriptId: scriptIdOrUndefined(scriptFilter),
      completion: completionFilter,
      allTime,
      from: effectiveDateRange?.from,
      to: effectiveDateRange?.to,
      range: effectiveDateRange,
      enabled: statsRangeEnabled(allTime, effectiveDateRange)
    });

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight">Gesture Statistics</h2>
          <p className="text-sm text-muted-foreground">
            {selectionLabel(selectedGestures, scriptFilter)}
          </p>
        </div>
        <StatsFilterControls
          period={period}
          setPeriod={setPeriod}
          completionFilter={completionFilter}
          setCompletionFilter={setCompletionFilter}
          scriptFilter={scriptFilter}
          setScriptFilter={setScriptFilter}
          scriptItems={SCRIPT_FILTER_ITEMS}
        />
      </div>

      <GestureSelector
        selectedGestures={selectedGestures}
        onSelectedGesturesChange={setSelectedGestures}
        scriptIdFilter={scriptFilter !== 'all' ? Number(scriptFilter) : undefined}
        locked={gestureText != null}
      />

      {period === 'custom' && (
        <CustomDateRangeRow dateRange={dateRange} setDateRange={setDateRange} />
      )}
      {statsQuery.isLoading && <StatsLoadingSkeleton />}
      {statsQuery.isError && (
        <div className="py-8 text-center">
          <div className="text-destructive">Failed to load statistics</div>
        </div>
      )}
      {/* Stats Content */}
      {!statsQuery.isLoading && statsQuery.isSuccess && (
        <StatsContentBody
          topGestures={topGesturesQuery.data?.gestures ?? []}
          topGesturesLoading={topGesturesQuery.isLoading}
          topUsers={topUsersQuery.data?.users ?? []}
          topUsersLoading={topUsersQuery.isLoading}
          summaryStats={summaryStats}
          chartData={chartData}
          chartType={chartType}
          setChartType={setChartType}
        />
      )}
    </div>
  );
};

export default GestureStats;

const STARTED_BAR_COLOR = 'hsl(210, 100%, 45%)';
const COMPLETED_BAR_COLOR = 'hsl(140, 70%, 40%)';

type TopGestureRow = {
  text: string;
  script_id: number;
  started: number;
  completed: number;
  avg_accuracy: number;
  avg_attempts: number;
};

type TopUserRow = {
  user_id: string;
  name: string;
  started: number;
  completed: number;
  avg_accuracy: number;
};

const TopGesturesLeader = ({
  gestures,
  isLoading
}: {
  gestures: TopGestureRow[];
  isLoading: boolean;
}) => {
  const maxStarted = gestures.reduce((max, g) => Math.max(max, g.started), 0);

  return (
    <Accordion defaultValue={[]} className="w-full">
      <AccordionItem
        value="top-gestures"
        className="overflow-hidden rounded-xl border border-slate-200/50 bg-linear-to-br from-white/80 to-slate-50/40 dark:border-slate-700/50 dark:from-slate-900/80 dark:to-slate-800/40"
      >
        <AccordionTrigger className="px-4 py-3 hover:no-underline">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 ring-1 ring-black/5 ring-inset dark:ring-white/10">
              <TrophyIcon className="size-3.5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="min-w-0 text-left">
              <p className="text-sm font-semibold tracking-tight">Top Practiced Gestures</p>
              <p className="text-xs font-normal text-muted-foreground">Top 10 by submissions</p>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pb-4">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : gestures.length === 0 ? (
            <p className="py-2 text-center text-sm text-muted-foreground">
              No gesture submissions in this period
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-[0.65rem] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: STARTED_BAR_COLOR }}
                  />
                  Started
                </span>
                <span className="inline-flex items-center gap-1">
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: COMPLETED_BAR_COLOR }}
                  />
                  Completed
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {gestures.map((gesture, index) => {
                  const key = `${gesture.script_id}::${gesture.text}`;
                  const barWidthPct = maxStarted > 0 ? (gesture.started / maxStarted) * 100 : 0;
                  const completedPct =
                    gesture.started > 0
                      ? Math.min(100, (gesture.completed / gesture.started) * 100)
                      : 0;

                  return (
                    <div
                      key={key}
                      className="min-w-0 space-y-1.5 rounded-lg border border-slate-200/40 bg-white/50 px-3 py-2.5 dark:border-slate-700/40 dark:bg-slate-950/30"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-medium">
                          <span className="mr-1.5 text-muted-foreground tabular-nums">
                            #{index + 1}
                          </span>
                          <span className="text-base">{gesture.text}</span>
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            {scriptLabel(gesture.script_id)}
                          </span>
                        </p>
                        <p className="shrink-0 text-[0.7rem] text-muted-foreground tabular-nums">
                          {gesture.completed}/{gesture.started} · {gesture.avg_accuracy}%
                        </p>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
                        <div
                          className="relative h-full overflow-hidden rounded-full transition-[width] duration-300"
                          style={{
                            width: `${barWidthPct}%`,
                            backgroundColor: STARTED_BAR_COLOR
                          }}
                        >
                          <div
                            className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300"
                            style={{
                              width: `${completedPct}%`,
                              backgroundColor: COMPLETED_BAR_COLOR
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

const TopUsersLeader = ({ users, isLoading }: { users: TopUserRow[]; isLoading: boolean }) => {
  const maxStarted = users.reduce((max, user) => Math.max(max, user.started), 0);

  return (
    <Accordion defaultValue={[]} className="w-full">
      <AccordionItem
        value="top-users"
        className="overflow-hidden rounded-xl border border-slate-200/50 bg-linear-to-br from-indigo-50/80 via-white/80 to-sky-50/40 dark:border-slate-700/50 dark:from-indigo-950/40 dark:via-slate-900/80 dark:to-slate-800/40"
      >
        <AccordionTrigger className="px-4 py-3 hover:no-underline">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 ring-1 ring-black/5 ring-inset dark:ring-white/10">
              <UsersIcon className="size-3.5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="min-w-0 text-left">
              <p className="text-sm font-semibold tracking-tight">Top Practitioners</p>
              <p className="text-xs font-normal text-muted-foreground">
                Top 10 signed-in users by recordings
              </p>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pb-4">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <p className="py-2 text-center text-sm text-muted-foreground">
              No signed-in recordings in this period
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-[0.65rem] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: STARTED_BAR_COLOR }}
                  />
                  Started
                </span>
                <span className="inline-flex items-center gap-1">
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: COMPLETED_BAR_COLOR }}
                  />
                  Completed
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {users.map((user, index) => {
                  const barWidthPct = maxStarted > 0 ? (user.started / maxStarted) * 100 : 0;
                  const completedPct =
                    user.started > 0 ? Math.min(100, (user.completed / user.started) * 100) : 0;

                  return (
                    <div
                      key={user.user_id}
                      className="min-w-0 space-y-1.5 rounded-lg border border-indigo-200/40 bg-white/70 px-3 py-2.5 dark:border-indigo-800/40 dark:bg-slate-950/30"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-medium">
                          <span className="mr-1.5 text-muted-foreground tabular-nums">
                            #{index + 1}
                          </span>
                          <span>{user.name}</span>
                        </p>
                        <p className="shrink-0 text-[0.7rem] text-muted-foreground tabular-nums">
                          {user.completed}/{user.started} · {user.avg_accuracy}%
                        </p>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
                        <div
                          className="relative h-full overflow-hidden rounded-full transition-[width] duration-300"
                          style={{
                            width: `${barWidthPct}%`,
                            backgroundColor: STARTED_BAR_COLOR
                          }}
                        >
                          <div
                            className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300"
                            style={{
                              width: `${completedPct}%`,
                              backgroundColor: COMPLETED_BAR_COLOR
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

// Charts section component
const ChartsSection = ({
  chartData,
  chartConfig,
  chartType,
  setChartType
}: {
  chartData: ChartDataType;
  chartConfig: typeof DEFAULT_CHART_CONFIG;
  chartType: ChartType;
  setChartType: (chartType: ChartType) => void;
}) => (
  <Card className="w-full">
    <CardHeader className="gap-1 px-3 py-2 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ChartSelector chartType={chartType} setChartType={setChartType} />
        {chartData.isBucketed && (
          <p className="text-xs text-muted-foreground">Grouped for readability</p>
        )}
      </div>
    </CardHeader>
    <CardContent className="w-full p-2 sm:p-3">
      <ChartContainer
        config={chartConfig}
        initialDimension={{ width: 1200, height: 360 }}
        className="aspect-auto h-60 w-full min-w-0 sm:h-72 md:h-80 lg:h-96 [&_.recharts-responsive-container]:w-full! [&_.recharts-surface]:w-full"
      >
        {chartType === 'script' || chartType === 'text' ? (
          <FrequencyBarChart
            data={chartType === 'script' ? chartData.scriptFrequency : chartData.textFrequency}
            fill={chartConfig.frequency.color}
            largeTicks={chartType === 'text'}
          />
        ) : (
          <TrendAreaChart data={chartData.dailyStats} chartType={chartType} />
        )}
      </ChartContainer>
    </CardContent>
  </Card>
);

type FrequencyDatum = { name: string; frequency: number };

// Bar chart for script / text breakdowns
const FrequencyBarChart = ({
  data,
  fill,
  largeTicks
}: {
  data: FrequencyDatum[];
  fill: string;
  largeTicks: boolean;
}) => (
  <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" />
    <XAxis
      dataKey="name"
      className="stroke-muted-foreground"
      tick={{
        className: 'fill-muted-foreground',
        fontSize: largeTicks ? 16 : 12
      }}
      angle={largeTicks ? 0 : -45}
      textAnchor={largeTicks ? 'middle' : 'end'}
      height={largeTicks ? 40 : 60}
      interval={0}
    />
    <YAxis
      className="stroke-muted-foreground"
      tick={{ className: 'fill-muted-foreground', fontSize: 12 }}
      width={48}
    />
    <ChartTooltip content={<ChartTooltipContent />} />
    <Bar dataKey="frequency" fill={fill} radius={[4, 4, 0, 0]} />
  </BarChart>
);

type TrendChartType = 'started-completed' | 'avg-accuracy' | 'avg-attempts';

function trendTooltip(chartType: TrendChartType) {
  if (chartType === 'started-completed') return <StartedCompletedTooltip />;
  if (chartType === 'avg-accuracy') return <AvgAccuracyTooltip />;
  return <AvgAttemptsTooltip />;
}

// Area chart for started/completed and average trends
const TrendAreaChart = ({
  data,
  chartType
}: {
  data: DailyStatPoint[];
  chartType: TrendChartType;
}) => (
  <AreaChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
    <defs>
      <linearGradient id="startedFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor="hsl(210, 100%, 45%)" stopOpacity={0.35} />
        <stop offset="95%" stopColor="hsl(210, 100%, 45%)" stopOpacity={0.02} />
      </linearGradient>
      <linearGradient id="completedFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor="hsl(140, 70%, 40%)" stopOpacity={0.35} />
        <stop offset="95%" stopColor="hsl(140, 70%, 40%)" stopOpacity={0.02} />
      </linearGradient>
      <linearGradient id="avgAccuracyFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor="hsl(30, 100%, 50%)" stopOpacity={0.35} />
        <stop offset="95%" stopColor="hsl(30, 100%, 50%)" stopOpacity={0.02} />
      </linearGradient>
      <linearGradient id="avgAttemptsFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor="hsl(120, 100%, 40%)" stopOpacity={0.35} />
        <stop offset="95%" stopColor="hsl(120, 100%, 40%)" stopOpacity={0.02} />
      </linearGradient>
    </defs>
    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" vertical={false} />
    <XAxis
      dataKey="label"
      className="stroke-muted-foreground"
      tick={{ className: 'fill-muted-foreground', fontSize: 11 }}
      interval="preserveStartEnd"
      minTickGap={24}
      padding={{ left: 8, right: 8 }}
    />
    <YAxis
      className="stroke-muted-foreground"
      tick={{ className: 'fill-muted-foreground', fontSize: 12 }}
      width={48}
      allowDecimals={false}
    />
    <ChartTooltip content={trendTooltip(chartType)} />
    <TrendAreas chartType={chartType} />
  </AreaChart>
);

// Conditional area series for the active trend view
const TrendAreas = ({ chartType }: { chartType: TrendChartType }) => (
  <>
    {chartType === 'started-completed' && (
      <Area
        type="monotone"
        dataKey="started"
        stroke="hsl(210, 100%, 45%)"
        fill="url(#startedFill)"
        strokeWidth={2}
        dot={false}
        activeDot={{ r: 4, strokeWidth: 0 }}
      />
    )}
    {chartType === 'started-completed' && (
      <Area
        type="monotone"
        dataKey="completed"
        stroke="hsl(140, 70%, 40%)"
        fill="url(#completedFill)"
        strokeWidth={2}
        dot={false}
        activeDot={{ r: 4, strokeWidth: 0 }}
      />
    )}
    {chartType === 'avg-accuracy' && (
      <Area
        type="monotone"
        dataKey="avgAccuracy"
        stroke="hsl(30, 100%, 50%)"
        fill="url(#avgAccuracyFill)"
        strokeWidth={2}
        dot={false}
        activeDot={{ r: 4, strokeWidth: 0 }}
      />
    )}
    {chartType === 'avg-attempts' && (
      <Area
        type="monotone"
        dataKey="avgAttempts"
        stroke="hsl(120, 100%, 40%)"
        fill="url(#avgAttemptsFill)"
        strokeWidth={2}
        dot={false}
        activeDot={{ r: 4, strokeWidth: 0 }}
      />
    )}
  </>
);

// Loading skeleton component
const StatsLoadingSkeleton = () => (
  <div className="space-y-3">
    <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 xl:grid-cols-5">
      {[...Array(5)].map((_, i) => (
        <Card key={i} className="overflow-hidden">
          <CardContent className="flex flex-col gap-1.5 p-3">
            <div className="flex items-start justify-between gap-2 pl-2">
              <div className="space-y-1.5">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="h-7 w-14" />
              </div>
              <Skeleton className="size-8 shrink-0 rounded-lg" />
            </div>
            <Skeleton className="ml-2 h-2.5 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
    <Card className="w-full">
      <CardHeader className="px-3 py-2">
        <Skeleton className="h-8 w-48" />
      </CardHeader>
      <CardContent className="p-2 sm:p-3">
        <Skeleton className="h-60 w-full sm:h-72 md:h-80" />
      </CardContent>
    </Card>
  </div>
);

// Top filter controls — completion status + script + period
const StatsFilterControls = ({
  period,
  setPeriod,
  completionFilter,
  setCompletionFilter,
  scriptFilter,
  setScriptFilter,
  scriptItems
}: {
  period: PeriodType;
  setPeriod: (period: PeriodType) => void;
  completionFilter: CompletionFilter;
  setCompletionFilter: (filter: CompletionFilter) => void;
  scriptFilter: string;
  setScriptFilter: (filter: string) => void;
  scriptItems: { label: string; value: string }[];
}) => (
  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
    <div className="flex shrink-0 items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">Status</span>
      <Select
        items={COMPLETION_ITEMS}
        value={completionFilter}
        onValueChange={(value) => {
          if (value) setCompletionFilter(value);
        }}
      >
        <SelectTrigger size="sm" className="h-8 w-32" aria-label="Select completion status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="completed">Completed</SelectItem>
          <SelectItem value="incomplete">Incomplete</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <div className="flex shrink-0 items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">Script</span>
      <Select
        items={scriptItems}
        value={scriptFilter}
        onValueChange={(value) => {
          if (value) setScriptFilter(value);
        }}
      >
        <SelectTrigger size="sm" className="h-8 w-32" aria-label="Select script">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {scriptItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
    <div className="flex shrink-0 items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">Period</span>
      <Select
        items={PERIOD_ITEMS}
        value={period}
        onValueChange={(value) => {
          if (value) setPeriod(value);
        }}
      >
        <SelectTrigger size="sm" className="h-8 w-36" aria-label="Select period">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all_time">All Time</SelectItem>
          <SelectItem value="last_week">Last Week</SelectItem>
          <SelectItem value="last_month">Last Month</SelectItem>
          <SelectItem value="last_3_months">Last 3 Months</SelectItem>
          <SelectItem value="custom">Custom Range</SelectItem>
        </SelectContent>
      </Select>
    </div>
  </div>
);

const CustomDateRangeRow = ({
  dateRange,
  setDateRange
}: {
  dateRange: DateRange;
  setDateRange: React.Dispatch<React.SetStateAction<DateRange>>;
}) => (
  <div className="flex flex-wrap items-center gap-2">
    <span className="text-xs font-medium text-muted-foreground">From</span>
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'h-8 justify-start text-left font-normal',
              !dateRange.from && 'text-muted-foreground'
            )}
          />
        }
      >
        <CalendarIcon className="mr-1.5 size-3.5" />
        {dateRange.from ? formatTooltipLabel(dateRange.from, true) : 'Pick date'}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={dateRange.from}
          onSelect={(date) => setDateRange((prev) => ({ ...prev, from: date }))}
          disabled={(date) => !!dateRange.to && date > dateRange.to}
        />
      </PopoverContent>
    </Popover>
    <span className="text-xs font-medium text-muted-foreground">To</span>
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'h-8 justify-start text-left font-normal',
              !dateRange.to && 'text-muted-foreground'
            )}
          />
        }
      >
        <CalendarIcon className="mr-1.5 size-3.5" />
        {dateRange.to ? formatTooltipLabel(dateRange.to, true) : 'Pick date'}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={dateRange.to}
          onSelect={(date) => setDateRange((prev) => ({ ...prev, to: date }))}
          disabled={(date) => !!dateRange.from && date < dateRange.from}
        />
      </PopoverContent>
    </Popover>
  </div>
);

// Summary cards component
type SummaryStats = {
  totalStarted: number;
  totalCompleted: number;
  completionRate: number;
  avgAccuracy: number;
  avgAttempts: number;
};

const StatMetricCard = ({
  title,
  value,
  description,
  icon: Icon,
  accent
}: {
  title: string;
  value: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  accent: { bar: string; iconBg: string; iconColor: string };
}) => (
  <Card className="overflow-hidden border-slate-200/50 bg-linear-to-br from-white/80 to-slate-50/40 shadow-sm transition-shadow hover:shadow-md dark:border-slate-700/50 dark:from-slate-900/80 dark:to-slate-800/40">
    <CardContent className="relative flex flex-col gap-1.5 p-3">
      <div className={cn('absolute inset-y-2 left-0 w-1 rounded-r-full', accent.bar)} />
      <div className="flex items-start justify-between gap-2 pl-2">
        <div className="min-w-0 space-y-1">
          <p className="text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">
            {title}
          </p>
          <p className="text-xl leading-none font-bold tracking-tight tabular-nums sm:text-2xl">
            {value}
          </p>
        </div>
        <div
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-black/5 ring-inset dark:ring-white/10',
            accent.iconBg
          )}
        >
          <Icon className={cn('size-3.5', accent.iconColor)} />
        </div>
      </div>
      <p className="pl-2 text-[0.7rem] text-muted-foreground">{description}</p>
    </CardContent>
  </Card>
);

const SummaryCards = ({ summaryStats }: { summaryStats: SummaryStats }) => (
  <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 xl:grid-cols-5">
    <StatMetricCard
      title="Total Started"
      value={summaryStats.totalStarted.toLocaleString()}
      description="Submissions started"
      icon={UsersIcon}
      accent={{
        bar: 'bg-blue-500',
        iconBg: 'bg-blue-500/10',
        iconColor: 'text-blue-600 dark:text-blue-400'
      }}
    />
    <StatMetricCard
      title="Completions"
      value={summaryStats.totalCompleted.toLocaleString()}
      description="Gestures completed"
      icon={CheckCircle2Icon}
      accent={{
        bar: 'bg-emerald-500',
        iconBg: 'bg-emerald-500/10',
        iconColor: 'text-emerald-600 dark:text-emerald-400'
      }}
    />
    <StatMetricCard
      title="Completion Rate"
      value={`${summaryStats.completionRate}%`}
      description="Of started submissions"
      icon={TrendingUpIcon}
      accent={{
        bar: 'bg-violet-500',
        iconBg: 'bg-violet-500/10',
        iconColor: 'text-violet-600 dark:text-violet-400'
      }}
    />
    <StatMetricCard
      title="Avg Accuracy"
      value={`${summaryStats.avgAccuracy}%`}
      description="Per submission"
      icon={CrosshairIcon}
      accent={{
        bar: 'bg-rose-500',
        iconBg: 'bg-rose-500/10',
        iconColor: 'text-rose-600 dark:text-rose-400'
      }}
    />
    <StatMetricCard
      title="Avg Attempts"
      value={summaryStats.avgAttempts.toFixed(1)}
      description="Strokes per submission"
      icon={HashIcon}
      accent={{
        bar: 'bg-amber-500',
        iconBg: 'bg-amber-500/10',
        iconColor: 'text-amber-600 dark:text-amber-400'
      }}
    />
  </div>
);

// Chart selector component
const ChartSelector = ({
  chartType,
  setChartType
}: {
  chartType: ChartType;
  setChartType: (chartType: ChartType) => void;
}) => (
  <div className="flex flex-wrap items-center gap-2">
    <label className="text-xs font-medium text-muted-foreground">View</label>
    <Select
      items={CHART_TYPE_ITEMS}
      value={chartType}
      onValueChange={(value) => {
        if (value) setChartType(value);
      }}
    >
      <SelectTrigger size="sm" className="h-8 w-52" aria-label="Select view">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="started-completed">Started and Completed</SelectItem>
        <SelectItem value="avg-accuracy">Average Accuracy</SelectItem>
        <SelectItem value="avg-attempts">Average Attempts</SelectItem>
        <SelectItem value="script">Script</SelectItem>
        <SelectItem value="text">Text</SelectItem>
      </SelectContent>
    </Select>
  </div>
);
