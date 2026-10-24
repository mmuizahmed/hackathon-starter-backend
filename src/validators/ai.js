import { z } from 'zod';
import { isoDate, objectId } from './common.js';

const chatMessage = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().trim().min(1).max(4000),
});

export const chatSchema = z.object({
  message: z.string().trim().min(1).max(4000).optional(),
  messages: z.array(chatMessage).min(1).max(20).optional(),
}).refine((value) => value.message || value.messages?.length, { message: 'Send a message' });

export const summarySchema = z.object({
  kpis: z.unknown().refine((value) => value !== null && typeof value === 'object', {
    message: 'kpis must be an object or array',
  }),
  filters: z.object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    departmentId: objectId.optional(),
  }).optional(),
});

export const smartLeaveSchema = z.object({
  text: z.string().trim().min(1).max(1000),
});

export const explainPayslipSchema = z.object({
  payslipId: objectId,
});

export const policySchema = z.object({
  question: z.string().trim().min(1).max(1000),
});
