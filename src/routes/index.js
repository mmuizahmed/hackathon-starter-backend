import { Router } from 'express';
import auditRoutes from './audit.routes.js';
import authRoutes from './auth.routes.js';
import healthRoutes from './health.routes.js';
import setupRoutes from './setup.routes.js';

const router = Router();

router.use(healthRoutes);
router.use('/setup', setupRoutes);
router.use('/auth', authRoutes);
router.use('/audit', auditRoutes);

export default router;
