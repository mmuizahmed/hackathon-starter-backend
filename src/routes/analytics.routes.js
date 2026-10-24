import { Router } from 'express';
import {
  getAdminAnalytics,
  getAnomalies,
  getAttritionRisk,
  getHrAnalytics,
  getMyAnalytics,
} from '../controllers/analytics.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateQuery } from '../middleware/validate.js';
import { analyticsQuerySchema } from '../validators/analytics.js';

const router = Router();

router.get('/admin', requireAuth, requireRole('admin'), validateQuery(analyticsQuerySchema), getAdminAnalytics);
router.get('/hr', requireAuth, requireRole('admin', 'hr'), validateQuery(analyticsQuerySchema), getHrAnalytics);
router.get('/me', requireAuth, requireRole('admin', 'hr', 'employee'), getMyAnalytics);
router.get('/anomalies', requireAuth, requireRole('admin', 'hr'), validateQuery(analyticsQuerySchema), getAnomalies);
router.get('/attrition-risk', requireAuth, requireRole('admin', 'hr'), validateQuery(analyticsQuerySchema), getAttritionRisk);

export default router;
