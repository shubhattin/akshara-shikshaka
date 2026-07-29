import { t, protectedAdminProcedure, publicProcedure, runTrpcEffect } from '../trpc_init';
import { z } from 'zod';
import { LessonCategoriesSchemaZod, TextLessonsSchemaZod } from '~/db/schema_zod';
import {
  addLessonCategory,
  addUpdateLessonCategory,
  deleteLessonCategory,
  getCategoryTextLessonList,
  getLessonCategories,
  getTextLessonsByCategory,
  updateLessonCategoryList,
  updateTextLessonsOrder
} from '~/effect/workflows/lesson_categories';

const get_categories_route = publicProcedure
  .input(z.object({ lang_id: z.int() }))
  .query(async ({ input }) => runTrpcEffect(getLessonCategories(input)));

const add_category_route = protectedAdminProcedure
  .input(LessonCategoriesSchemaZod.pick({ lang_id: true, name: true }))
  .mutation(async ({ input }) => runTrpcEffect(addLessonCategory(input)));

const update_category_list_route = protectedAdminProcedure
  .input(
    z.object({
      lang_id: z.int(),
      categories: LessonCategoriesSchemaZod.pick({ id: true, name: true, order: true }).array()
    })
  )
  .mutation(async ({ input }) => runTrpcEffect(updateLessonCategoryList(input)));

const delete_category_route = protectedAdminProcedure
  .input(z.object({ lesson_id: z.int(), lang_id: z.int() }))
  .mutation(async ({ input }) => runTrpcEffect(deleteLessonCategory(input)));

const get_text_lessons_route = protectedAdminProcedure
  .input(z.object({ category_id: z.int().min(0), lang_id: z.int() }))
  .query(async ({ input }) => runTrpcEffect(getTextLessonsByCategory(input)));

const update_text_lessons_order_route = protectedAdminProcedure
  .input(
    z.object({
      lessons: TextLessonsSchemaZod.pick({ id: true, order: true }).array(),
      category_id: z.int()
    })
  )
  .mutation(async ({ input }) => runTrpcEffect(updateTextLessonsOrder(input)));

const add_update_lesson_category_route = protectedAdminProcedure
  .input(
    z.object({
      category_id: z.int().min(1).nullable(),
      prev_category_id: z.int().optional(),
      lesson_id: z.int()
    })
  )
  .mutation(async ({ input }) => runTrpcEffect(addUpdateLessonCategory(input)));

const get_category_text_lesson_list_route = publicProcedure
  .input(z.object({ category_id: z.int() }))
  .query(async ({ input }) => runTrpcEffect(getCategoryTextLessonList(input)));

export const lesson_categories_router = t.router({
  get_categories: get_categories_route,
  add_category: add_category_route,
  update_category_list: update_category_list_route,
  delete_category: delete_category_route,
  get_text_lessons: get_text_lessons_route,
  update_text_lessons_order: update_text_lessons_order_route,
  add_update_lesson_category: add_update_lesson_category_route,
  get_category_text_lesson_list: get_category_text_lesson_list_route
});

// Re-export for delete helpers that still import the old name
export { reorder_text_lesson_in_category as reorder_text_lesson_in_category_func } from '~/effect/workflows/lesson_categories';
