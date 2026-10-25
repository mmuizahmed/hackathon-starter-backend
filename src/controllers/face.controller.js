import { enrollFace, getMyFace, resetFace } from '../services/face.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const getFace = asyncHandler(async (req, res) => {
  sendSuccess(res, await getMyFace(req.user));
});

export const postEnroll = asyncHandler(async (req, res) => {
  sendSuccess(res, await enrollFace(req.user, req.validated), 201);
});

export const deleteFace = asyncHandler(async (req, res) => {
  sendSuccess(res, await resetFace(req.user, req.params.employeeId));
});
