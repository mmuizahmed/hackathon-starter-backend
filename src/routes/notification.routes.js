import { Router } from 'express';
import { list, readAll, readOne, unread } from '../controllers/notification.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { rejectBadObjectId, validateQuery } from '../middleware/validate.js';
import { notificationQuerySchema } from '../validators/notification.js';

const router = Router();

router.param('id', rejectBadObjectId);

router.get('/', requireAuth, validateQuery(notificationQuerySchema), list);
router.get('/unread-count', requireAuth, unread);
router.post('/read-all', requireAuth, readAll);
router.post('/:id/read', requireAuth, readOne);

export default router;
