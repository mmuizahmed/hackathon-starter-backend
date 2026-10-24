import { listAuditLogs } from '../services/audit.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const listAudit = asyncHandler(async (req, res) => {
  const data = await listAuditLogs(req.validatedQuery);
  sendSuccess(res, data);
});
