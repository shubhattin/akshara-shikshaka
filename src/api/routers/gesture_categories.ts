import { z } from 'zod';
import { t, protectedAdminProcedure, runTrpcEffect } from '~/api/trpc_init';
import { GestureCategoriesSchemaZod, TextGesturesSchemaZod } from '~/db/schema_zod';
import {
  addGestureCategory,
  addUpdateGestureCategory,
  deleteGestureCategory,
  getGestureCategories,
  getGesturesByCategory,
  updateGestureCategoryList,
  updateGesturesOrder
} from '~/effect/workflows/text_gestures';
import { appRuntime } from '~/effect/runtime';

const get_categories_route = protectedAdminProcedure.query(async () =>
  runTrpcEffect(getGestureCategories())
);

const add_category_route = protectedAdminProcedure
  .input(GestureCategoriesSchemaZod.pick({ name: true }))
  .mutation(async ({ input }) => runTrpcEffect(addGestureCategory(input)));

const update_list_route = protectedAdminProcedure
  .input(
    z.object({
      categories: GestureCategoriesSchemaZod.pick({ id: true, name: true, order: true }).array()
    })
  )
  .mutation(async ({ input }) => runTrpcEffect(updateGestureCategoryList(input)));

const delete_category_route = protectedAdminProcedure
  .input(z.object({ category_id: z.int() }))
  .mutation(async ({ input }) => runTrpcEffect(deleteGestureCategory(input)));

const get_gestures_route = protectedAdminProcedure
  .input(z.object({ category_id: z.int().min(0), script_id: z.int() }))
  .query(async ({ input }) => runTrpcEffect(getGesturesByCategory(input)));

const update_gestures_order_route = protectedAdminProcedure
  .input(
    z.object({
      gestures: TextGesturesSchemaZod.pick({ id: true, order: true }).array(),
      category_id: z.int()
    })
  )
  .mutation(async ({ input }) => runTrpcEffect(updateGesturesOrder(input)));

const add_update_gesture_category_route = protectedAdminProcedure
  .input(
    z.object({
      category_id: z.int().min(1).nullable(),
      prev_category_id: z.int().optional(),
      gesture_text_key: z.string().min(1),
      gesture_id: z.int(),
      script_id: z.int()
    })
  )
  .mutation(async ({ input }) => runTrpcEffect(addUpdateGestureCategory(input)));

export const gesture_categories_router = t.router({
  get_categories: get_categories_route,
  add_category: add_category_route,
  update_list: update_list_route,
  delete_category: delete_category_route,
  get_gestures: get_gestures_route,
  update_gestures_order: update_gestures_order_route,
  add_update_gesture_category: add_update_gesture_category_route
});

export { reorder_text_gesture_in_category as reorder_text_gesture_in_category_func } from '~/effect/workflows/text_gestures';

/** Route-loader helper — use runtime directly (not TRPC error mapping). */
export const get_text_gesture_categories_func = () => appRuntime.runPromise(getGestureCategories());
