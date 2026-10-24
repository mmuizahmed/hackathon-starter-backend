import { Router } from 'express';
import {
  postChat,
  postExplainPayslip,
  postPolicy,
  postSmartLeave,
  postSummary,
} from '../controllers/ai.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  chatSchema,
  explainPayslipSchema,
  policySchema,
  smartLeaveSchema,
  summarySchema,
} from '../validators/ai.js';

const router = Router();

router.post('/chat', requireAuth, requireRole('admin', 'hr', 'employee'), validateBody(chatSchema), postChat);
router.post('/summary', requireAuth, requireRole('admin', 'hr'), validateBody(summarySchema), postSummary);
router.post('/smart-leave', requireAuth, requireRole('hr', 'employee'), validateBody(smartLeaveSchema), postSmartLeave);
router.post('/explain-payslip', requireAuth, requireRole('admin', 'hr', 'employee'), validateBody(explainPayslipSchema), postExplainPayslip);
router.post('/policy', requireAuth, requireRole('admin', 'hr', 'employee'), validateBody(policySchema), postPolicy);

export default router;
