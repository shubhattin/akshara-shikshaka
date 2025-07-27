import { z } from 'zod';
import { createSelectSchema } from 'drizzle-zod';
import { text_data } from './schema';

export const TextDataSchemaZod = createSelectSchema(text_data, {
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});
