import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { checkPassword, hashPassword } from '../utils/password.js';
import { recordAudit } from './audit.service.js';

export async function loginUser({ email, password }) {
  const user = await User.findOne({ email }).select('+passwordHash');
  // Same message either way so a stranger cannot tell which emails exist.
  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }
  const matches = await checkPassword(password, user.passwordHash);
  if (!matches) {
    throw new AppError('Invalid email or password', 401);
  }
  if (!user.active) {
    throw new AppError('Account is deactivated', 403);
  }
  return user;
}

export async function changeUserPassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user || !user.active) {
    throw new AppError('Authentication required', 401);
  }
  const matches = await checkPassword(currentPassword, user.passwordHash);
  if (!matches) {
    throw new AppError('Current password is incorrect', 400);
  }

  const before = { mustChangePassword: user.mustChangePassword };
  user.passwordHash = await hashPassword(newPassword);
  user.mustChangePassword = false;
  await user.save();

  await recordAudit({
    actorId: user._id,
    action: 'user.password_change',
    entity: 'User',
    entityId: user._id,
    before,
    after: { mustChangePassword: false },
  });
  return user;
}
