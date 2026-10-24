import {
  createDepartment,
  deleteDepartment,
  listDepartments,
  updateDepartment,
} from '../services/department.service.js';
import {
  createDesignation,
  deleteDesignation,
  listDesignations,
  updateDesignation,
} from '../services/designation.service.js';
import {
  createHoliday,
  deleteHoliday,
  listHolidays,
  updateHoliday,
} from '../services/holiday.service.js';
import {
  createLeaveType,
  deleteLeaveType,
  listLeaveTypes,
  updateLeaveType,
} from '../services/leaveType.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const getDepartments = asyncHandler(async (req, res) => {
  sendSuccess(res, await listDepartments(req.validatedQuery));
});

export const postDepartment = asyncHandler(async (req, res) => {
  sendSuccess(res, await createDepartment(req.user, req.validated), 201);
});

export const patchDepartment = asyncHandler(async (req, res) => {
  sendSuccess(res, await updateDepartment(req.user, req.params.id, req.validated));
});

export const removeDepartment = asyncHandler(async (req, res) => {
  sendSuccess(res, await deleteDepartment(req.user, req.params.id));
});

export const getDesignations = asyncHandler(async (req, res) => {
  sendSuccess(res, await listDesignations(req.validatedQuery));
});

export const postDesignation = asyncHandler(async (req, res) => {
  sendSuccess(res, await createDesignation(req.user, req.validated), 201);
});

export const patchDesignation = asyncHandler(async (req, res) => {
  sendSuccess(res, await updateDesignation(req.user, req.params.id, req.validated));
});

export const removeDesignation = asyncHandler(async (req, res) => {
  sendSuccess(res, await deleteDesignation(req.user, req.params.id));
});

export const getLeaveTypes = asyncHandler(async (req, res) => {
  sendSuccess(res, await listLeaveTypes(req.validatedQuery));
});

export const postLeaveType = asyncHandler(async (req, res) => {
  sendSuccess(res, await createLeaveType(req.user, req.validated), 201);
});

export const patchLeaveType = asyncHandler(async (req, res) => {
  sendSuccess(res, await updateLeaveType(req.user, req.params.id, req.validated));
});

export const removeLeaveType = asyncHandler(async (req, res) => {
  sendSuccess(res, await deleteLeaveType(req.user, req.params.id));
});

export const getHolidays = asyncHandler(async (req, res) => {
  sendSuccess(res, await listHolidays(req.validatedQuery));
});

export const postHoliday = asyncHandler(async (req, res) => {
  sendSuccess(res, await createHoliday(req.user, req.validated), 201);
});

export const patchHoliday = asyncHandler(async (req, res) => {
  sendSuccess(res, await updateHoliday(req.user, req.params.id, req.validated));
});

export const removeHoliday = asyncHandler(async (req, res) => {
  sendSuccess(res, await deleteHoliday(req.user, req.params.id));
});
