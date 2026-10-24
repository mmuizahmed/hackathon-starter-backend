import { completeSetup, isInitialized } from '../services/setup.service.js';
import { setAuthCookie } from '../utils/authCookie.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { toPublicUser } from '../utils/publicUser.js';
import { sendSuccess } from '../utils/response.js';
import { signToken } from '../utils/token.js';

export const getSetupStatus = asyncHandler(async (_req, res) => {
  const initialized = await isInitialized();
  sendSuccess(res, { initialized });
});

export const postSetup = asyncHandler(async (req, res) => {
  const user = await completeSetup(req.validated);
  setAuthCookie(res, signToken(user));
  sendSuccess(res, { user: toPublicUser(user) }, 201);
});
