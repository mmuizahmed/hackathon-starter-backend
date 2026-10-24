import { Router } from 'express';
import { getSetupStatus, postSetup } from '../controllers/setup.controller.js';
import { validateBody } from '../middleware/validate.js';
import { setupSchema } from '../validators/setup.js';

const router = Router();

router.get('/status', getSetupStatus);
router.post('/', validateBody(setupSchema), postSetup);

export default router;
