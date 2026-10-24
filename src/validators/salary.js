import { z } from 'zod';
import { isoDateSchema, optionalObjectId, pageLimitFields } from './common.js';

export const salaryQuerySchema = z.object({
  ...pageLimitFields,
  employeeId: optionalObjectId,
});

export const salaryBodySchema = z.object({
  basic: z.number().positive(),
  effectiveFrom: isoDateSchema,
  allowances: z
    .object({
      hra: z.number().min(0),
      medical: z.number().min(0),
      other: z.number().min(0),
    })
    .optional(),
});
