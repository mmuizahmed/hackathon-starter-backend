import { z } from 'zod';

export function blankToUndefined(value) {
  if (value === undefined || value === '') return undefined;
  return value;
}

// Leave and payroll validators use this name. It is the same helper.
export const emptyToUndefined = blankToUndefined;

export const pageQuery = {
  page: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).optional()),
  limit: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(100).optional()),
};

export const pageLimitFields = pageQuery;

export const objectId = z.string().trim().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const objectIdSchema = objectId;

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

export function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// Leave and payroll reject 2026-02-31. Organization dates keep the shorter isoDate check.
export const isoDateSchema = z.string().trim().refine(isIsoDate, 'Use a real date as YYYY-MM-DD');

export const monthSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM')
  .refine((value) => {
    const month = Number(value.slice(5));
    return month >= 1 && month <= 12;
  }, 'Use YYYY-MM');

export const optionalObjectId = z.preprocess(emptyToUndefined, objectIdSchema.optional());
