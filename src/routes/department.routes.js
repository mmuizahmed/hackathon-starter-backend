import { Router } from 'express';
import {
  getDepartments,
  patchDepartment,
  postDepartment,
  removeDepartment,
} from '../controllers/org.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { listQuerySchema, nameSchema, nameUpdateSchema } from '../validators/org.js';

const router = Router();

router.get('/', requireAuth, requireRole('admin', 'hr'), validateQuery(listQuerySchema), getDepartments);
router.post('/', requireAuth, requireRole('admin'), validateBody(nameSchema), postDepartment);
router.patch('/:id', requireAuth, requireRole('admin'), validateBody(nameUpdateSchema), patchDepartment);
router.delete('/:id', requireAuth, requireRole('admin'), removeDepartment);

export default router;
