import { z } from 'zod';

// The browser sends the faceres embedding: a list of finite numbers, no photo.
export const enrollFaceSchema = z.object({
  descriptor: z.array(z.number().finite()).min(64).max(2048),
  model: z.string().trim().min(1).max(64),
});
