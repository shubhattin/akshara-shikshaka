import { z } from 'zod';
import { createSelectSchema } from 'drizzle-zod';
import { text_data } from './schema';

export const TextDataSchemaZod = createSelectSchema(text_data, {
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});
