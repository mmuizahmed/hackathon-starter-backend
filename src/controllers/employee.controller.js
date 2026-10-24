import {
  exportEmployees,
  getEmployee,
  importEmployees,
  listEmployees,
  registerEmployee,
  updateEmployee,
} from '../services/employee.service.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const getEmployees = asyncHandler(async (req, res) => {
  sendSuccess(res, await listEmployees(req.user, req.validatedQuery));
});

export const postEmployee = asyncHandler(async (req, res) => {
  sendSuccess(res, await registerEmployee(req.user, req.validated), 201);
});

export const getOneEmployee = asyncHandler(async (req, res) => {
  sendSuccess(res, await getEmployee(req.user, req.params.id));
});

export const patchEmployee = asyncHandler(async (req, res) => {
  sendSuccess(res, await updateEmployee(req.user, req.params.id, req.validated));
});

export const postImport = asyncHandler(async (req, res) => {
  let csv = '';
  if (req.file) csv = req.file.buffer.toString('utf8');
  else if (typeof req.body?.csv === 'string') csv = req.body.csv;
  else throw new AppError('Upload a CSV file in field "file", or send JSON { csv }', 400);
  // Missing dryRun stays a dry run so a click cannot write by accident.
  const dryRun = req.query.dryRun !== 'false';
  sendSuccess(res, await importEmployees(req.user, csv, { dryRun }));
});

export const getExport = asyncHandler(async (req, res) => {
  const csv = await exportEmployees(req.user, req.validatedQuery);
  res.set('content-type', 'text/csv; charset=utf-8');
  res.set('content-disposition', 'attachment; filename="employees.csv"');
  res.status(200).send(csv);
});
