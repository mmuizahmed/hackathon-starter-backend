import { Router } from 'express';
import {
  getHolidays,
  patchHoliday,
  postHoliday,
  removeHoliday,
} from '../controllers/org.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { rejectBadObjectId, validateBody, validateQuery } from '../middleware/validate.js';
import { holidayQuerySchema, holidaySchema, holidayUpdateSchema } from '../validators/org.js';

const router = Router();

router.param('id', rejectBadObjectId);

router.get('/', requireAuth, requireRole('admin', 'hr'), validateQuery(holidayQuerySchema), getHolidays);
router.post('/', requireAuth, requireRole('admin'), validateBody(holidaySchema), postHoliday);
router.patch('/:id', requireAuth, requireRole('admin'), validateBody(holidayUpdateSchema), patchHoliday);
router.delete('/:id', requireAuth, requireRole('admin'), removeHoliday);

export default router;
