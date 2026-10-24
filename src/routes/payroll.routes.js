import { Router } from 'express';
import { checks, createRun, finalize, getRun, listRuns } from '../controllers/payroll.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { rejectBadObjectId, validateBody, validateQuery } from '../middleware/validate.js';
import { finalizePayrollSchema, payrollListQuerySchema, payrollMonthSchema } from '../validators/payroll.js';

const router = Router();

router.param('id', rejectBadObjectId);

router.post('/runs', requireAuth, requireRole('hr'), validateBody(payrollMonthSchema), createRun);
router.get('/runs', requireAuth, requireRole('admin', 'hr'), validateQuery(payrollListQuerySchema), listRuns);
router.get('/runs/:id/checks', requireAuth, requireRole('admin', 'hr'), checks);
router.get('/runs/:id', requireAuth, requireRole('admin', 'hr'), getRun);
router.post('/runs/:id/finalize', requireAuth, requireRole('admin'), validateBody(finalizePayrollSchema), finalize);

export default router;
