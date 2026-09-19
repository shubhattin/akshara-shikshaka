import { z } from 'zod';

export const dashboard_gesture_row_schema = z.object({
  text: z.string(),
  script_id: z.number().int(),
  started: z.number(),
  completed: z.number(),
  avg_accuracy: z.number().nullable()
});

export const dashboard_recent_row_schema = z.object({
  id: z.number().int(),
  text: z.string(),
  script_id: z.number().int(),
  completed: z.boolean(),
  avg_accuracy: z.number().nullable(),
  created_at: z.coerce.date()
});

export const akshara_dashboard_stats_schema = z.object({
  started: z.number(),
  completed: z.number(),
  completion_rate: z.number(),
  best_accuracy: z.number().nullable(),
  avg_accuracy: z.number().nullable(),
  top_gestures: dashboard_gesture_row_schema.array(),
  recent: dashboard_recent_row_schema.array()
});

export type DashboardGestureRow = z.infer<typeof dashboard_gesture_row_schema>;
export type DashboardRecentRow = z.infer<typeof dashboard_recent_row_schema>;
export type AksharaDashboardStats = z.infer<typeof akshara_dashboard_stats_schema>;

export const emptyDashboardStats = (): AksharaDashboardStats => ({
  started: 0,
  completed: 0,
  completion_rate: 0,
  best_accuracy: null,
  avg_accuracy: null,
  top_gestures: [],
  recent: []
});
