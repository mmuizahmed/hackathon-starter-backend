import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

// Cookie lifetime in authCookie.js matches this 7 day expiry.
const EXPIRES_IN = '7d';

export function signToken(user) {
  // `sub` is the user id. Role is included for debugging only.
  // Every protected request reloads the user from the database.
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
    },
    env.jwtSecret,
    { expiresIn: EXPIRES_IN },
  );
}

export function readToken(token) {
  return jwt.verify(token, env.jwtSecret);
}
