import { Router } from 'express';
import { listAudit } from '../controllers/audit.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateQuery } from '../middleware/validate.js';
import { auditQuerySchema } from '../validators/audit.js';

const router = Router();

router.get('/', requireAuth, requireRole('admin'), validateQuery(auditQuerySchema), listAudit);

export default router;
