import { Router } from 'express';
import {
  getLeaveTypes,
  patchLeaveType,
  postLeaveType,
  removeLeaveType,
} from '../controllers/org.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { rejectBadObjectId, validateBody, validateQuery } from '../middleware/validate.js';
import { leaveTypeSchema, leaveTypeUpdateSchema, listQuerySchema } from '../validators/org.js';

const router = Router();

router.param('id', rejectBadObjectId);

router.get('/', requireAuth, validateQuery(listQuerySchema), getLeaveTypes);
router.post('/', requireAuth, requireRole('admin'), validateBody(leaveTypeSchema), postLeaveType);
router.patch('/:id', requireAuth, requireRole('admin'), validateBody(leaveTypeUpdateSchema), patchLeaveType);
router.delete('/:id', requireAuth, requireRole('admin'), removeLeaveType);

export default router;
