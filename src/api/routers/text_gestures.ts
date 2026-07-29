import { z } from 'zod';
import { t, protectedAdminProcedure, publicProcedure, runTrpcEffect } from '~/api/trpc_init';
import { GestureSchema } from '~/tools/stroke_data/types';
import {
  addTextGestureData,
  deleteTextGestureData,
  editTextGestureData,
  getTextGestureData
} from '~/effect/workflows/text_gestures';
import { gesture_categories_router } from './gesture_categories';

const add_text_gesture_data_route = protectedAdminProcedure
  .input(
    z.object({
      text: z.string().min(1),
      textKey: z.string().min(1),
      gestures: GestureSchema.array(),
      scriptID: z.int(),
      fontFamily: z.string().min(1),
      fontSize: z.int(),
      textCenterOffset: z.tuple([z.number(), z.number()])
    })
  )
  .output(
    z.discriminatedUnion('success', [
      z.object({
        success: z.literal(true),
        id: z.number(),
        uuid: z.uuid()
      }),
      z.object({
        success: z.literal(false),
        err_code: z.enum(['text_already_exists'])
      })
    ])
  )
  .mutation(async ({ input }) => runTrpcEffect(addTextGestureData(input)));

const edit_text_gesture_data_route = protectedAdminProcedure
  .input(
    z.object({
      id: z.number(),
      uuid: z.uuid(),
      gestures: GestureSchema.array(),
      fontFamily: z.string().min(1),
      fontSize: z.int(),
      textCenterOffset: z.tuple([z.number(), z.number()])
    })
  )
  .mutation(async ({ input }) => runTrpcEffect(editTextGestureData(input)));

const delete_text_gesture_data_route = protectedAdminProcedure
  .input(z.object({ id: z.number(), uuid: z.uuid(), script_id: z.int() }))
  .mutation(async ({ input }) => runTrpcEffect(deleteTextGestureData(input)));

const get_text_gesture_data_route = publicProcedure
  .input(z.object({ id: z.int(), uuid: z.uuid() }))
  .query(async ({ input }) => runTrpcEffect(getTextGestureData(input)));

export const text_gestures_router = t.router({
  add_text_gesture_data: add_text_gesture_data_route,
  edit_text_gesture_data: edit_text_gesture_data_route,
  delete_text_gesture_data: delete_text_gesture_data_route,
  categories: gesture_categories_router,
  get_text_gesture_data: get_text_gesture_data_route
});
