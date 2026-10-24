import { z } from 'zod';

const email = z.string().trim().email().transform((value) => value.toLowerCase());

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(72),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(72),
    newPassword: z.string().min(8).max(72),
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: 'New password must be different',
    path: ['newPassword'],
  });
