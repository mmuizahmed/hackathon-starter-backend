import { adminDashboard, hrDashboard, myDashboard } from '../services/analytics.service.js';
import { absenceAnomalies, attritionRisk } from '../services/insights.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const getAdminAnalytics = asyncHandler(async (req, res) => {
  sendSuccess(res, await adminDashboard(req.user, req.validatedQuery));
});

export const getHrAnalytics = asyncHandler(async (req, res) => {
  sendSuccess(res, await hrDashboard(req.user, req.validatedQuery));
});

export const getMyAnalytics = asyncHandler(async (req, res) => {
  sendSuccess(res, await myDashboard(req.user));
});

export const getAnomalies = asyncHandler(async (req, res) => {
  sendSuccess(res, await absenceAnomalies(req.user, req.validatedQuery));
});

export const getAttritionRisk = asyncHandler(async (req, res) => {
  sendSuccess(res, await attritionRisk(req.user, req.validatedQuery));
});
