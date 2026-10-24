import { Router } from 'express';
import { create, list, update } from '../controllers/announcement.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { rejectBadObjectId, validateBody, validateQuery } from '../middleware/validate.js';
import { announcementBodySchema, announcementPatchSchema, announcementQuerySchema } from '../validators/announcement.js';

const router = Router();

router.param('id', rejectBadObjectId);

router.get('/', requireAuth, validateQuery(announcementQuerySchema), list);
router.post('/', requireAuth, requireRole('admin', 'hr'), validateBody(announcementBodySchema), create);
router.patch('/:id', requireAuth, requireRole('admin', 'hr'), validateBody(announcementPatchSchema), update);

export default router;
