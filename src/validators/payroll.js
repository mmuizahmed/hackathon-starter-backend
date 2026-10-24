import { z } from 'zod';
import { emptyToUndefined, monthSchema, optionalObjectId, pageLimitFields } from './common.js';

export const payrollMonthSchema = z.object({
  month: monthSchema,
});

export const payrollListQuerySchema = z.object({
  ...pageLimitFields,
});

export const finalizePayrollSchema = z
  .object({
    override: z.boolean().optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((value) => !value.override || Boolean(value.reason), {
    message: 'A reason is required when overriding payroll checks',
    path: ['reason'],
  });

export const payslipQuerySchema = z.object({
  ...pageLimitFields,
  month: z.preprocess(emptyToUndefined, monthSchema.optional()),
  employeeId: optionalObjectId,
});
