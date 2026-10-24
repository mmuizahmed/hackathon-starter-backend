import { Router } from 'express';
import { changePassword, login, logout, me } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { loginRateLimit } from '../middleware/loginRateLimit.js';
import { validateBody } from '../middleware/validate.js';
import { changePasswordSchema, loginSchema } from '../validators/auth.js';

const router = Router();

router.post('/login', loginRateLimit, validateBody(loginSchema), login);
router.post('/logout', logout);
router.get('/me', requireAuth, me);
router.post('/change-password', requireAuth, validateBody(changePasswordSchema), changePassword);

export default router;
