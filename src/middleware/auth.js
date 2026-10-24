import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { toRequestUser } from '../utils/publicUser.js';
import { readToken } from '../utils/token.js';

// A signed-in user with a temporary password may only call these.
// Any other path is rejected here, including routes added later.
const ALLOWED_BEFORE_PASSWORD_CHANGE = new Set([
  '/api/health',
  '/api/setup/status',
  '/api/setup',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/auth/change-password',
]);

function pathOnly(req) {
  const withoutQuery = req.originalUrl.split('?')[0];
  if (withoutQuery.length > 1 && withoutQuery.endsWith('/')) {
    return withoutQuery.slice(0, -1);
  }
  return withoutQuery;
}

// Does not reject the request. A bad cookie just means "not logged in".
// The user row is loaded from the database so role and mustChangePassword stay current.
export function attachUser(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    req.user = null;
    next();
    return;
  }

  let payload;
  try {
    payload = readToken(token);
  } catch {
    req.user = null;
    next();
    return;
  }

  // Avoid a long hang when the process was started without MongoDB.
  if (mongoose.connection.readyState !== 1) {
    req.user = null;
    next();
    return;
  }

  User.findById(payload.sub)
    .then((user) => {
      req.user = user ? toRequestUser(user) : null;
      next();
    })
    .catch(next);
}

export function blockIfPasswordChangeRequired(req, res, next) {
  if (!req.user?.active || !req.user.mustChangePassword) {
    next();
    return;
  }
  if (ALLOWED_BEFORE_PASSWORD_CHANGE.has(pathOnly(req))) {
    next();
    return;
  }
  next(new AppError('Password change required', 403));
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    next(new AppError('Authentication required', 401));
    return;
  }
  if (!req.user.active) {
    next(new AppError('Account is deactivated', 403));
    return;
  }
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      next(new AppError('Authentication required', 401));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new AppError('You do not have access to this resource', 403));
      return;
    }
    next();
  };
}
