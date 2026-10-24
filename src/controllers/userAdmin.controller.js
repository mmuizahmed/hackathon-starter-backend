import { createHrUser, listUsers, updateUser } from '../services/userAdmin.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const getUsers = asyncHandler(async (req, res) => {
  sendSuccess(res, await listUsers(req.validatedQuery));
});

export const postUser = asyncHandler(async (req, res) => {
  sendSuccess(res, await createHrUser(req.user, req.validated), 201);
});

export const patchUser = asyncHandler(async (req, res) => {
  sendSuccess(res, await updateUser(req.user, req.params.id, req.validated));
});
