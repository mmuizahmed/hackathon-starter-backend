import { z } from 'zod';
import { emptyToUndefined, isoDateSchema, objectIdSchema, optionalObjectId, pageLimitFields } from './common.js';

export const leaveBalanceQuerySchema = z.object({
  employeeId: optionalObjectId,
  year: z.preprocess(emptyToUndefined, z.coerce.number().int().min(2000).max(2100).optional()),
});

export const leaveListQuerySchema = z.object({
  ...pageLimitFields,
  status: z.preprocess(
    emptyToUndefined,
    z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
  ),
  employeeId: optionalObjectId,
  departmentId: optionalObjectId,
  from: z.preprocess(emptyToUndefined, isoDateSchema.optional()),
  to: z.preprocess(emptyToUndefined, isoDateSchema.optional()),
});

export const applyLeaveSchema = z
  .object({
    leaveTypeId: objectIdSchema,
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    reason: z.string().trim().min(1).max(500),
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  });

export const reviewLeaveSchema = z
  .object({
    decision: z.enum(['approved', 'rejected']),
    comment: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.decision !== 'rejected' || Boolean(value.comment), {
    message: 'A comment is required when rejecting leave',
    path: ['comment'],
  });
