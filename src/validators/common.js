import { z } from 'zod';

export function blankToUndefined(value) {
  if (value === undefined || value === '') return undefined;
  return value;
}

export const pageQuery = {
  page: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).optional()),
  limit: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(100).optional()),
};

export const objectId = z.string().trim().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
