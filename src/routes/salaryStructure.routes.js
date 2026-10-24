import { Router } from 'express';
import { list, setStructure } from '../controllers/salary.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { salaryBodySchema, salaryQuerySchema } from '../validators/salary.js';

const router = Router();

router.get('/', requireAuth, requireRole('admin', 'hr'), validateQuery(salaryQuerySchema), list);
router.put('/:employeeId', requireAuth, requireRole('hr'), validateBody(salaryBodySchema), setStructure);

export default router;
