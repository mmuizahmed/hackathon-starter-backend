import { createAnnouncement, listAnnouncements, updateAnnouncement } from '../services/announcement.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const list = asyncHandler(async (req, res) => {
  sendSuccess(res, await listAnnouncements(req.user, req.validatedQuery));
});

export const create = asyncHandler(async (req, res) => {
  sendSuccess(res, await createAnnouncement(req.user, req.validated), 201);
});

export const update = asyncHandler(async (req, res) => {
  sendSuccess(res, await updateAnnouncement(req.user, req.params.id, req.validated));
});
