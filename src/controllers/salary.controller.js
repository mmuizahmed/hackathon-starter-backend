import { listSalaryStructures, setSalaryStructure } from '../services/salary.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const list = asyncHandler(async (req, res) => {
  sendSuccess(res, await listSalaryStructures(req.user, req.validatedQuery));
});

export const setStructure = asyncHandler(async (req, res) => {
  sendSuccess(res, await setSalaryStructure(req.user, req.params.employeeId, req.validated));
});
