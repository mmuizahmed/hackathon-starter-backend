import { Router } from 'express';
import { getUsers, patchUser, postUser } from '../controllers/userAdmin.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { createHrSchema, updateUserSchema, userQuerySchema } from '../validators/users.js';

const router = Router();

router.get('/', requireAuth, requireRole('admin'), validateQuery(userQuerySchema), getUsers);
router.post('/', requireAuth, requireRole('admin'), validateBody(createHrSchema), postUser);
router.patch('/:id', requireAuth, requireRole('admin'), validateBody(updateUserSchema), patchUser);

export default router;
