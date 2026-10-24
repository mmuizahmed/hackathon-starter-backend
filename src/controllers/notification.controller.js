import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  unreadCount,
} from '../services/notification.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const list = asyncHandler(async (req, res) => {
  sendSuccess(res, await listNotifications(req.user, req.validatedQuery));
});

export const unread = asyncHandler(async (req, res) => {
  sendSuccess(res, await unreadCount(req.user));
});

export const readOne = asyncHandler(async (req, res) => {
  sendSuccess(res, await markNotificationRead(req.user, req.params.id));
});

export const readAll = asyncHandler(async (req, res) => {
  sendSuccess(res, await markAllNotificationsRead(req.user));
});
