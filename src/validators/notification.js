import { z } from 'zod';
import { pageLimitFields } from './common.js';

export const notificationQuerySchema = z.object({
  ...pageLimitFields,
});
