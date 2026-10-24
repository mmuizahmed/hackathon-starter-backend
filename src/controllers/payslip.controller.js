import { getPayslip, listPayslips, renderPayslipPdf } from '../services/payslip.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const list = asyncHandler(async (req, res) => {
  sendSuccess(res, await listPayslips(req.user, req.validatedQuery));
});

export const getOne = asyncHandler(async (req, res) => {
  sendSuccess(res, await getPayslip(req.user, req.params.id));
});

export const download = asyncHandler(async (req, res) => {
  const { filename, buffer } = await renderPayslipPdf(req.user, req.params.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(buffer);
});
