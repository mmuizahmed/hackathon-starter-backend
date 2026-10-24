import { Router } from 'express';
import { apply, balances, cancel, list, review } from '../controllers/leave.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { applyLeaveSchema, leaveBalanceQuerySchema, leaveListQuerySchema, reviewLeaveSchema } from '../validators/leave.js';

const router = Router();

router.get('/balances', requireAuth, validateQuery(leaveBalanceQuerySchema), balances);
router.get('/requests', requireAuth, validateQuery(leaveListQuerySchema), list);
router.post('/requests', requireAuth, validateBody(applyLeaveSchema), apply);
router.post('/requests/:id/cancel', requireAuth, cancel);
router.post('/requests/:id/review', requireAuth, requireRole('hr'), validateBody(reviewLeaveSchema), review);

export default router;
