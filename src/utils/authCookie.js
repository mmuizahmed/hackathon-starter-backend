import { env } from '../config/env.js';

// httpOnly: browser JavaScript cannot read the token (safer than localStorage).
// Domain is left unset so the Vercel /api proxy keeps the cookie first-party.
// SameSite=Lax blocks most cross-site posts. Secure is on only for HTTPS in production.
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function authCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production',
    path: '/',
    maxAge: SEVEN_DAYS_MS,
  };
}

export function setAuthCookie(res, token) {
  res.cookie('token', token, authCookieOptions());
}

export function clearAuthCookie(res) {
  const options = authCookieOptions();
  delete options.maxAge;
  res.clearCookie('token', options);
}
