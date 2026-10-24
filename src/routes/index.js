import { Router } from 'express';
import attendanceRoutes from './attendance.routes.js';
import auditRoutes from './audit.routes.js';
import authRoutes from './auth.routes.js';
import departmentRoutes from './department.routes.js';
import designationRoutes from './designation.routes.js';
import employeeRoutes from './employee.routes.js';
import healthRoutes from './health.routes.js';
import holidayRoutes from './holiday.routes.js';
import leaveTypeRoutes from './leaveType.routes.js';
import settingsRoutes from './settings.routes.js';
import setupRoutes from './setup.routes.js';
import userRoutes from './user.routes.js';

const router = Router();

router.use(healthRoutes);
router.use('/setup', setupRoutes);
router.use('/auth', authRoutes);
router.use('/audit', auditRoutes);
// Settings, org, people, and attendance. Leave and payroll mounts belong to the other backend.
router.use('/settings', settingsRoutes);
router.use('/departments', departmentRoutes);
router.use('/designations', designationRoutes);
router.use('/leave-types', leaveTypeRoutes);
router.use('/holidays', holidayRoutes);
router.use('/users', userRoutes);
router.use('/employees', employeeRoutes);
router.use('/attendance', attendanceRoutes);

export default router;
