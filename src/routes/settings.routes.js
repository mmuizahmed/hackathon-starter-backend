import { Router } from 'express';
import { getSettings, putSettings } from '../controllers/settings.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { settingsUpdateSchema } from '../validators/settings.js';

const router = Router();

router.get('/', requireAuth, requireRole('admin', 'hr'), getSettings);
// PUT is the contract. PATCH calls the same handler so an older client still works.
router.put('/', requireAuth, requireRole('admin'), validateBody(settingsUpdateSchema), putSettings);
router.patch('/', requireAuth, requireRole('admin'), validateBody(settingsUpdateSchema), putSettings);

export default router;
