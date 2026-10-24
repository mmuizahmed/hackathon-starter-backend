import { Router } from 'express';
import { download, getOne, list } from '../controllers/payslip.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validateQuery } from '../middleware/validate.js';
import { payslipQuerySchema } from '../validators/payroll.js';

const router = Router();

router.get('/', requireAuth, validateQuery(payslipQuerySchema), list);
router.get('/:id/pdf', requireAuth, download);
router.get('/:id', requireAuth, getOne);

export default router;
