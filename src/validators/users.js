import { z } from 'zod';
import { blankToUndefined, pageQuery } from './common.js';

const email = z.string().trim().email().transform((value) => value.toLowerCase());

export const createHrSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email,
  password: z.string().min(8).max(72),
  role: z.enum(['admin', 'hr', 'employee']).optional(),
});

export const updateUserSchema = z.object({
  active: z.boolean().optional(),
  resetPassword: z.boolean().optional(),
}).refine((value) => value.active !== undefined || value.resetPassword === true, {
  message: 'Send active or resetPassword',
});

export const userQuerySchema = z.object({
  ...pageQuery,
  role: z.preprocess(blankToUndefined, z.enum(['admin', 'hr', 'employee']).optional()),
  active: z.preprocess(blankToUndefined, z.enum(['true', 'false']).optional()),
});
