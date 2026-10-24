import { Router } from 'express';
import multer from 'multer';
import { AppError } from '../utils/AppError.js';
import {
  getEmployees,
  getExport,
  getOneEmployee,
  patchEmployee,
  postEmployee,
  postImport,
} from '../controllers/employee.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { rejectBadObjectId, validateBody, validateQuery } from '../middleware/validate.js';
import {
  createEmployeeSchema,
  employeeQuerySchema,
  importBodySchema,
  importQuerySchema,
  updateEmployeeSchema,
} from '../validators/employees.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 },
});

function readUpload(req, res, next) {
  const type = req.headers['content-type'] || '';
  if (!type.includes('multipart/form-data')) {
    next();
    return;
  }
  upload.single('file')(req, res, (error) => {
    if (error) {
      next(new AppError('CSV file must be 1 MB or smaller', 400));
      return;
    }
    next();
  });
}

const router = Router();

router.param('id', rejectBadObjectId);

router.get('/export', requireAuth, requireRole('hr'), validateQuery(employeeQuerySchema), getExport);
router.post(
  '/import',
  requireAuth,
  requireRole('hr'),
  readUpload,
  validateQuery(importQuerySchema),
  validateBody(importBodySchema),
  postImport,
);
router.get('/', requireAuth, requireRole('admin', 'hr', 'employee'), validateQuery(employeeQuerySchema), getEmployees);
router.post('/', requireAuth, requireRole('hr'), validateBody(createEmployeeSchema), postEmployee);
router.get('/:id', requireAuth, requireRole('admin', 'hr', 'employee'), getOneEmployee);
router.patch('/:id', requireAuth, requireRole('hr', 'employee'), validateBody(updateEmployeeSchema), patchEmployee);

export default router;
