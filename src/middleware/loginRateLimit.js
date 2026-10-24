import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

// 10 tries per 15 minutes per client IP. Tests raise the cap so the suite can log in more than that.
// In production app.js trusts one proxy hop, so this reads X-Forwarded-For from Render.
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.nodeEnv === 'test' ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler(req, res) {
    res.status(429).json({
      success: false,
      message: 'Too many login attempts. Try again later.',
    });
  },
});
