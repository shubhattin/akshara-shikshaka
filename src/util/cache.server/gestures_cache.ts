import { z } from 'zod';
import { createCache, fromDb } from '~/effect/cache';

const gesture_data = createCache({
  keyPrefix: 'text_gesture_data',
  schema: z.object({
    gesture_id: z.int(),
    gesture_uuid: z.uuid()
  }),
  keyBuilder: ({ gesture_id, gesture_uuid }) => `${gesture_id}:${gesture_uuid}`,
  fetch: ({ gesture_id, gesture_uuid }) =>
    fromDb('gesture_data', (db) =>
      db.query.text_gestures.findFirst({
        where: (table, { eq, and }) => and(eq(table.id, gesture_id), eq(table.uuid, gesture_uuid)),
        columns: {
          id: true,
          uuid: true,
          text: true,
          gestures: true,
          script_id: true
        }
      })
    )
});

export type GesturesCacheLoaders = {
  gesture_data: typeof gesture_data;
};

export const gestures_cache_loaders: GesturesCacheLoaders = {
  gesture_data
};
