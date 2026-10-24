import { answerPolicy, chat, explainPayslip, smartLeave, summarizeKpis } from '../services/ai/ai.service.js';
import { guardedAi } from '../services/ai/log.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

function withLabel(result) {
  return { ...result, aiGenerated: true, label: 'AI-generated' };
}

function lastUserText(body) {
  if (body.message) return body.message;
  const messages = body.messages || [];
  const last = [...messages].reverse().find((row) => row.role === 'user');
  return last?.content || '';
}

export const postChat = asyncHandler(async (req, res) => {
  const result = await guardedAi({
    user: req.user,
    feature: 'chat',
    message: lastUserText(req.validated),
    run: () => chat(req.user, req.validated),
  });
  sendSuccess(res, withLabel(result));
});

export const postSummary = asyncHandler(async (req, res) => {
  const result = await guardedAi({
    user: req.user,
    feature: 'summary',
    message: 'dashboard summary',
    run: () => summarizeKpis(req.user, req.validated),
  });
  sendSuccess(res, withLabel(result));
});

export const postSmartLeave = asyncHandler(async (req, res) => {
  const result = await guardedAi({
    user: req.user,
    feature: 'smart_leave',
    message: req.validated.text,
    run: () => smartLeave(req.user, req.validated),
  });
  sendSuccess(res, withLabel(result));
});

export const postExplainPayslip = asyncHandler(async (req, res) => {
  const result = await guardedAi({
    user: req.user,
    feature: 'explain_payslip',
    message: req.validated.payslipId,
    run: () => explainPayslip(req.user, req.validated),
  });
  sendSuccess(res, withLabel(result));
});

export const postPolicy = asyncHandler(async (req, res) => {
  const result = await guardedAi({
    user: req.user,
    feature: 'policy',
    message: req.validated.question,
    run: () => answerPolicy(req.user, req.validated),
  });
  sendSuccess(res, withLabel(result));
});
