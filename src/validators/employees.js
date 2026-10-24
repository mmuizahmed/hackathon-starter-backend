import { z } from 'zod';
import { blankToUndefined, isoDate, objectId, pageQuery } from './common.js';

const email = z.string().trim().email().transform((value) => value.toLowerCase());

export const createEmployeeSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(120),
  email,
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(240).optional(),
  departmentId: objectId,
  designationId: objectId,
  joinDate: isoDate,
  status: z.enum(['active', 'probation']).optional(),
  gender: z.enum(['male', 'female', 'other', 'undisclosed']).optional(),
  basicSalary: z.number().min(1),
});

export const updateEmployeeSchema = z.object({
  code: z.string().trim().min(1).max(20).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  email: email.optional(),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(240).optional(),
  departmentId: objectId.optional(),
  designationId: objectId.optional(),
  joinDate: isoDate.optional(),
  exitDate: isoDate.nullable().optional(),
  status: z.enum(['active', 'probation', 'exited']).optional(),
  gender: z.enum(['male', 'female', 'other', 'undisclosed']).optional(),
  basicSalary: z.number().min(1).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'Send at least one field' });

export const employeeQuerySchema = z.object({
  ...pageQuery,
  search: z.preprocess(blankToUndefined, z.string().trim().max(80).optional()),
  departmentId: z.preprocess(blankToUndefined, objectId.optional()),
  designationId: z.preprocess(blankToUndefined, objectId.optional()),
  status: z.preprocess(blankToUndefined, z.enum(['active', 'probation', 'exited']).optional()),
});
