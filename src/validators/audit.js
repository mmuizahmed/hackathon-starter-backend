import { z } from 'zod';

function emptyToUndefined(value) {
  if (value === undefined || value === '') return undefined;
  return value;
}

const optionalText = (max) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());

const optionalDate = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Invalid date' })
    .optional(),
);

export const auditQuerySchema = z.object({
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).optional()),
  limit: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100).optional()),
  action: optionalText(80),
  entity: optionalText(80),
  entityId: optionalText(80),
  actor: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .regex(/^[a-f\d]{24}$/i, 'actor must be an id')
      .optional(),
  ),
  from: optionalDate,
  to: optionalDate,
});
