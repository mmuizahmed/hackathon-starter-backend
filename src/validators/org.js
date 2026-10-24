import { z } from 'zod';
import { blankToUndefined, isoDate, pageQuery } from './common.js';

export const nameSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const nameUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  active: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'Send a name or active flag' });

export const listQuerySchema = z.object({
  ...pageQuery,
  active: z.preprocess(blankToUndefined, z.enum(['true', 'false']).optional()),
});

export const leaveTypeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  code: z.string().trim().min(1).max(20),
  yearlyQuota: z.number().min(0).nullable().optional(),
  paid: z.boolean(),
});

export const leaveTypeUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  code: z.string().trim().min(1).max(20).optional(),
  yearlyQuota: z.number().min(0).nullable().optional(),
  paid: z.boolean().optional(),
  active: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'Send at least one field' });

export const holidaySchema = z.object({
  date: isoDate,
  name: z.string().trim().min(1).max(120),
  tentative: z.boolean().optional(),
});

export const holidayUpdateSchema = holidaySchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'Send at least one field' },
);

export const holidayQuerySchema = z.object({
  ...pageQuery,
  year: z.preprocess(blankToUndefined, z.string().regex(/^\d{4}$/).optional()),
});
