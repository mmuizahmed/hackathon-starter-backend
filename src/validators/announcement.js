import { z } from 'zod';
import { pageLimitFields } from './common.js';

const audience = z.enum(['all', 'admin', 'hr', 'employee']);

function emptyToBool(value) {
  if (value === undefined || value === '') return undefined;
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
}

export const announcementQuerySchema = z.object({
  ...pageLimitFields,
  includeInactive: z.preprocess(emptyToBool, z.boolean().optional()),
});

export const announcementBodySchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(5000),
  audience,
});

export const announcementPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    body: z.string().trim().min(1).max(5000).optional(),
    audience: audience.optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'Provide a field to update',
  });
