import { z } from 'zod';
import { blankToUndefined, isoDate, objectId } from './common.js';

export const analyticsQuerySchema = z.object({
  from: z.preprocess(blankToUndefined, isoDate.optional()),
  to: z.preprocess(blankToUndefined, isoDate.optional()),
  departmentId: z.preprocess(blankToUndefined, objectId.optional()),
});
