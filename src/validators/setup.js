import { z } from 'zod';
import { WEEKDAYS } from '../constants/weekdays.js';

const email = z.string().trim().email().transform((value) => value.toLowerCase());

export const setupSchema = z
  .object({
    companyName: z.string().trim().min(1).max(120),
    adminName: z.string().trim().min(1).max(120),
    adminEmail: email,
    adminPassword: z.string().min(8).max(72),
    settings: z
      .object({
        officeStart: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'officeStart must be HH:mm')
          .optional(),
        graceMinutes: z.number().int().min(0).max(180).optional(),
        halfDayHours: z.number().min(1).max(12).optional(),
        weekend: z.array(z.enum(WEEKDAYS)).max(7).optional(),
        officeLat: z.number().min(-90).max(90).optional(),
        officeLng: z.number().min(-180).max(180).optional(),
        radiusMeters: z.number().positive().max(100000).optional(),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    const lat = value.settings?.officeLat;
    const lng = value.settings?.officeLng;
    if ((lat == null) !== (lng == null)) {
      ctx.addIssue({
        code: 'custom',
        message: 'officeLat and officeLng must be sent together',
        path: ['settings', 'officeLat'],
      });
    }
  });
