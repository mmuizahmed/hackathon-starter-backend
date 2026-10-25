import { z } from 'zod';
import { blankToUndefined, isoDate, objectId, pageQuery } from './common.js';

const location = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyMeters: z.number().min(0).optional(),
}).optional();

// The live embedding. Length is checked against the enrolled face in the service.
const descriptor = z.array(z.number().finite()).max(4096).optional();
const liveness = z.object({
  blink: z.boolean(),
}).optional();

const cameraFields = {
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  accuracy: z.number().min(0).optional(),
  faceCount: z.number().int().min(0).optional(),
  location,
  descriptor,
  liveness,
};

export const checkInSchema = z.object({
  source: z.enum(['web', 'camera']).optional(),
  ...cameraFields,
});

export const checkOutSchema = z.object({
  source: z.enum(['web', 'camera', 'correction']).optional(),
  ...cameraFields,
});

export const attendanceQuerySchema = z.object({
  ...pageQuery,
  from: z.preprocess(blankToUndefined, isoDate.optional()),
  to: z.preprocess(blankToUndefined, isoDate.optional()),
  employeeId: z.preprocess(blankToUndefined, objectId.optional()),
  departmentId: z.preprocess(blankToUndefined, objectId.optional()),
  status: z.preprocess(
    blankToUndefined,
    z.enum(['present', 'late', 'half_day', 'absent', 'missing_checkout', 'on_leave']).optional(),
  ),
});

export const boardQuerySchema = z.object({
  date: z.preprocess(blankToUndefined, isoDate.optional()),
  departmentId: z.preprocess(blankToUndefined, objectId.optional()),
});

export const calendarQuerySchema = z.object({
  month: z.preprocess(blankToUndefined, z.string().regex(/^\d{4}-\d{2}$/, 'Month must be YYYY-MM').optional()),
  employeeId: z.preprocess(blankToUndefined, objectId.optional()),
});

export const correctionSchema = z.object({
  date: isoDate,
  requestedCheckIn: z.string().trim().min(1).optional(),
  requestedCheckOut: z.string().trim().min(1).optional(),
  reason: z.string().trim().min(1).max(500),
}).refine((value) => value.requestedCheckIn || value.requestedCheckOut, {
  message: 'A correction needs a check-in or check-out time',
  path: ['requestedCheckIn'],
});

export const correctionQuerySchema = z.object({
  ...pageQuery,
  status: z.preprocess(blankToUndefined, z.enum(['pending', 'approved', 'rejected']).optional()),
});

export const reviewSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  comment: z.string().trim().min(1).max(500),
});
