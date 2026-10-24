import { changeUserPassword, loginUser } from '../services/auth.service.js';
import { clearAuthCookie, setAuthCookie } from '../utils/authCookie.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { publicUserFromRequest, toPublicUser } from '../utils/publicUser.js';
import { sendSuccess } from '../utils/response.js';
import { signToken } from '../utils/token.js';

export const login = asyncHandler(async (req, res) => {
  const user = await loginUser(req.validated);
  setAuthCookie(res, signToken(user));
  sendSuccess(res, { user: toPublicUser(user) });
});

// The token is not stored on the server, so logout only clears the cookie.
export const logout = asyncHandler(async (_req, res) => {
  clearAuthCookie(res);
  sendSuccess(res, { loggedOut: true });
});

export const me = asyncHandler(async (req, res) => {
  sendSuccess(res, { user: publicUserFromRequest(req.user) });
});

export const changePassword = asyncHandler(async (req, res) => {
  const user = await changeUserPassword(req.user.id, req.validated);
  sendSuccess(res, { user: toPublicUser(user) });
});
