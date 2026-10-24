import {
  finalizePayrollRun,
  generatePayrollRun,
  getPayrollChecks,
  getPayrollRun,
  listPayrollRuns,
} from '../services/payroll.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const createRun = asyncHandler(async (req, res) => {
  const { run, created } = await generatePayrollRun(req.user, req.validated.month);
  sendSuccess(res, run, created ? 201 : 200);
});

export const listRuns = asyncHandler(async (req, res) => {
  sendSuccess(res, await listPayrollRuns(req.user, req.validatedQuery));
});

export const getRun = asyncHandler(async (req, res) => {
  sendSuccess(res, await getPayrollRun(req.user, req.params.id));
});

export const checks = asyncHandler(async (req, res) => {
  sendSuccess(res, await getPayrollChecks(req.user, req.params.id));
});

export const finalize = asyncHandler(async (req, res) => {
  sendSuccess(res, await finalizePayrollRun(req.user, req.params.id, req.validated));
});
