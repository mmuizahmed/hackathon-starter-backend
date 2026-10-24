import { applyLeave, cancelLeave, getLeaveBalances, listLeaveRequests, reviewLeave } from '../services/leave.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const balances = asyncHandler(async (req, res) => {
  sendSuccess(res, await getLeaveBalances(req.user, req.validatedQuery));
});

export const list = asyncHandler(async (req, res) => {
  sendSuccess(res, await listLeaveRequests(req.user, req.validatedQuery));
});

export const apply = asyncHandler(async (req, res) => {
  sendSuccess(res, await applyLeave(req.user, req.validated), 201);
});

export const cancel = asyncHandler(async (req, res) => {
  sendSuccess(res, await cancelLeave(req.user, req.params.id));
});

export const review = asyncHandler(async (req, res) => {
  sendSuccess(res, await reviewLeave(req.user, req.params.id, req.validated));
});
