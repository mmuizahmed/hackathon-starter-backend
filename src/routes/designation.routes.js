import { Router } from 'express';
import {
  getDesignations,
  patchDesignation,
  postDesignation,
  removeDesignation,
} from '../controllers/org.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { rejectBadObjectId, validateBody, validateQuery } from '../middleware/validate.js';
import { listQuerySchema, nameSchema, nameUpdateSchema } from '../validators/org.js';

const router = Router();

router.param('id', rejectBadObjectId);

router.get('/', requireAuth, requireRole('admin', 'hr'), validateQuery(listQuerySchema), getDesignations);
router.post('/', requireAuth, requireRole('admin'), validateBody(nameSchema), postDesignation);
router.patch('/:id', requireAuth, requireRole('admin'), validateBody(nameUpdateSchema), patchDesignation);
router.delete('/:id', requireAuth, requireRole('admin'), removeDesignation);

export default router;
