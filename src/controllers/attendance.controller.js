import {
  checkIn,
  checkOut,
  dailyBoard,
  listAttendance,
  listCorrections,
  monthCalendar,
  requestCorrection,
  reviewCorrection,
} from '../services/attendance.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const postCheckIn = asyncHandler(async (req, res) => {
  sendSuccess(res, await checkIn(req.user, req.validated), 201);
});

export const postCheckOut = asyncHandler(async (req, res) => {
  sendSuccess(res, await checkOut(req.user, req.validated));
});

export const getAttendance = asyncHandler(async (req, res) => {
  sendSuccess(res, await listAttendance(req.user, req.validatedQuery));
});

export const getBoard = asyncHandler(async (req, res) => {
  sendSuccess(res, await dailyBoard(req.user, req.validatedQuery));
});

export const getCalendar = asyncHandler(async (req, res) => {
  sendSuccess(res, await monthCalendar(req.user, req.validatedQuery));
});

export const postCorrection = asyncHandler(async (req, res) => {
  sendSuccess(res, await requestCorrection(req.user, req.validated), 201);
});

export const getCorrections = asyncHandler(async (req, res) => {
  sendSuccess(res, await listCorrections(req.user, req.validatedQuery));
});

export const postReview = asyncHandler(async (req, res) => {
  sendSuccess(res, await reviewCorrection(req.user, req.params.id, req.validated));
});
