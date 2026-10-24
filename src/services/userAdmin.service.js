import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { assertObjectId } from '../utils/objectId.js';
import { pageData, readPage } from '../utils/page.js';
import { hashPassword, makeTemporaryPassword } from '../utils/password.js';
import { toPublicUser } from '../utils/publicUser.js';
import { recordAudit } from './audit.service.js';

function toUser(user) {
  return {
    ...toPublicUser(user),
    active: user.active !== false,
  };
}

export async function listUsers(query) {
  const { page, limit, skip } = readPage(query);
  const filter = {};
  if (query.role) filter.role = query.role;
  if (query.active === 'true') filter.active = true;
  if (query.active === 'false') filter.active = false;
  const [rows, total] = await Promise.all([
    User.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);
  return pageData(rows.map(toUser), total, page, limit);
}

// Creates an HR login only. Employee logins come from registering an employee.
export async function createHrUser(actor, input) {
  if (input.role === 'admin') {
    throw new AppError('Admin users cannot be created through the API', 400);
  }
  if (input.role === 'employee') {
    throw new AppError('Create employees with POST /api/employees', 400);
  }
  const existing = await User.findOne({ email: input.email });
  if (existing) throw new AppError('A login with this email already exists', 409);

  const user = await User.create({
    name: input.name,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    role: 'hr',
    active: true,
    mustChangePassword: true,
    employee: null,
  });
  await recordAudit({
    actorId: actor.id,
    action: 'user.create',
    entity: 'User',
    entityId: user._id,
    before: null,
    after: { name: user.name, email: user.email, role: 'hr' },
  });
  return { user: toUser(user), temporaryPassword: input.password };
}

export async function updateUser(actor, id, input) {
  assertObjectId(id, 'user id');
  const user = await User.findById(id).select('+passwordHash');
  if (!user) throw new AppError('User was not found', 404);
  if (String(user._id) === String(actor.id) && input.active === false) {
    throw new AppError('You cannot deactivate your own login', 400);
  }

  const before = { active: user.active, mustChangePassword: user.mustChangePassword };
  let temporaryPassword = null;
  if (input.active !== undefined) user.active = input.active;
  if (input.resetPassword) {
    temporaryPassword = makeTemporaryPassword();
    user.passwordHash = await hashPassword(temporaryPassword);
    user.mustChangePassword = true;
  }
  await user.save();
  await recordAudit({
    actorId: actor.id,
    action: 'user.update',
    entity: 'User',
    entityId: user._id,
    before,
    after: {
      active: user.active,
      mustChangePassword: user.mustChangePassword,
      reset: Boolean(input.resetPassword),
    },
  });
  const data = { user: toUser(user) };
  if (temporaryPassword) data.temporaryPassword = temporaryPassword;
  return data;
}
