import { Router } from 'express';
import {
  getAttendance,
  getBoard,
  getCalendar,
  getCorrections,
  postCheckIn,
  postCheckOut,
  postCorrection,
  postReview,
} from '../controllers/attendance.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { rejectBadObjectId, validateBody, validateQuery } from '../middleware/validate.js';
import {
  attendanceQuerySchema,
  boardQuerySchema,
  calendarQuerySchema,
  checkInSchema,
  checkOutSchema,
  correctionQuerySchema,
  correctionSchema,
  reviewSchema,
} from '../validators/attendance.js';

const router = Router();

router.param('id', rejectBadObjectId);

router.post('/check-in', requireAuth, requireRole('hr', 'employee'), validateBody(checkInSchema), postCheckIn);
router.post('/check-out', requireAuth, requireRole('hr', 'employee'), validateBody(checkOutSchema), postCheckOut);
router.get('/board', requireAuth, requireRole('admin', 'hr'), validateQuery(boardQuerySchema), getBoard);
router.get('/calendar', requireAuth, requireRole('admin', 'hr', 'employee'), validateQuery(calendarQuerySchema), getCalendar);
router.get('/corrections', requireAuth, requireRole('admin', 'hr', 'employee'), validateQuery(correctionQuerySchema), getCorrections);
router.post('/corrections', requireAuth, requireRole('hr', 'employee'), validateBody(correctionSchema), postCorrection);
router.post('/corrections/:id/review', requireAuth, requireRole('hr'), validateBody(reviewSchema), postReview);
router.get('/', requireAuth, requireRole('admin', 'hr', 'employee'), validateQuery(attendanceQuerySchema), getAttendance);

export default router;
