import { readSettings, updateSettings } from '../services/settings.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const getSettings = asyncHandler(async (_req, res) => {
  sendSuccess(res, await readSettings());
});

export const putSettings = asyncHandler(async (req, res) => {
  sendSuccess(res, await updateSettings(req.user, req.validated));
});
