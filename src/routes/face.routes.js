import { Router } from 'express';
import { deleteFace, getFace, postEnroll } from '../controllers/face.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { rejectBadObjectId, validateBody } from '../middleware/validate.js';
import { enrollFaceSchema } from '../validators/face.js';

const router = Router();

router.param('employeeId', rejectBadObjectId);

router.get('/me', requireAuth, requireRole('employee'), getFace);
router.post('/enroll', requireAuth, requireRole('employee'), validateBody(enrollFaceSchema), postEnroll);
router.delete('/:employeeId', requireAuth, requireRole('hr', 'admin'), deleteFace);

export default router;
