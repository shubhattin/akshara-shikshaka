import { z } from 'zod';
import { t, publicProcedure } from '../trpc_init';
import * as fs from 'fs/promises';
import db_json from './db.json';

const schema = z.object({
  text: z.string().min(1),
  path: z.string().min(1),
  font_size: z.number().nullable().default(null),
  stroke_data: z.array(z.any()).nullable().default(null)
});

export const get_text_data_func = async (text: string) => {
  const data_json = schema.array().parse(db_json);
  const data_item = data_json.find((item: any) => item.text === text);
  return schema.parse(data_item);
};

export const get_texts_list_func = async () => {
  const data_json = schema.array().parse(db_json);
  return data_json.map((item) => item.text);
};

const get_text_data_route = publicProcedure
  .input(z.object({ text: z.string().min(1) }))
  .query(async ({ input }) => {
    return get_text_data_func(input.text);
  });

export const text_data_router = t.router({
  get_text_data: get_text_data_route
});
