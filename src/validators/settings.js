import { z } from 'zod';
import { WEEKDAYS } from '../constants/weekdays.js';

export const settingsUpdateSchema = z.object({
  companyName: z.string().trim().min(1).max(120).optional(),
  officeStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'officeStart must be HH:mm').optional(),
  graceMinutes: z.number().int().min(0).max(180).optional(),
  halfDayHours: z.number().min(1).max(12).optional(),
  weekend: z.array(z.enum(WEEKDAYS)).max(7).optional(),
  officeLat: z.number().min(-90).max(90).nullable().optional(),
  officeLng: z.number().min(-180).max(180).nullable().optional(),
  radiusMeters: z.number().positive().max(100000).optional(),
  latePenalty: z.object({
    enabled: z.boolean().optional(),
    latesPerHalfDay: z.number().int().min(1).max(31).optional(),
  }).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'Send at least one setting' });
