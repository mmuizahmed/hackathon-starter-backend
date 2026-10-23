import { getDbStatus } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const getHealth = asyncHandler(async (_req, res) => {
  sendSuccess(res, {
    status: 'ok',
    uptime: Math.round(process.uptime()),
    db: getDbStatus(),
  });
});
