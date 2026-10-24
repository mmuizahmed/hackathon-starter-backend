import { Department } from '../models/Department.js';
import { Designation } from '../models/Designation.js';
import { Employee } from '../models/Employee.js';
import { Payslip } from '../models/Payslip.js';
import { Settings } from '../models/Settings.js';
import { AppError } from '../utils/AppError.js';
import { idString, isObjectId } from '../utils/ids.js';
import { pageData, readPage } from '../utils/page.js';
import { buildPayslipPdf } from './payslipPdf.js';
import { assertOwnEmployee, employeeScopeFilter } from './scope.service.js';

function toPayslip(row) {
  const employee = row.employee && row.employee._id ? row.employee : null;
  return {
    id: row._id.toString(),
    payrollRunId: idString(row.payrollRun),
    employeeId: employee ? employee._id.toString() : idString(row.employee),
    employeeName: employee ? employee.name : null,
    employeeCode: employee ? employee.code : null,
    month: row.month,
    departmentId: idString(row.department),
    designationId: idString(row.designation),
    gross: row.gross,
    deductions: row.deductions,
    tax: row.tax,
    net: row.net,
    breakdown: row.breakdown,
  };
}

async function findOwnPayslip(user, id) {
  if (!isObjectId(id)) throw new AppError('Payslip not found', 404);
  const row = await Payslip.findById(id).populate('employee', 'name code');
  if (!row) throw new AppError('Payslip not found', 404);
  assertOwnEmployee(user, row.employee?._id || row.employee);
  return row;
}

export async function listPayslips(user, query) {
  if (query.employeeId) assertOwnEmployee(user, query.employeeId);
  const { page, limit, skip } = readPage(query);
  const filter = { ...employeeScopeFilter(user) };
  if (query.employeeId) filter.employee = query.employeeId;
  if (query.month) filter.month = query.month;
  const [rows, total] = await Promise.all([
    Payslip.find(filter)
      .sort({ month: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('employee', 'name code')
      .lean(),
    Payslip.countDocuments(filter),
  ]);
  return pageData(rows.map(toPayslip), total, page, limit);
}

export async function getPayslip(user, id) {
  const row = await findOwnPayslip(user, id);
  return toPayslip(row);
}

export async function renderPayslipPdf(user, id) {
  const row = await findOwnPayslip(user, id);
  const [settings, employee, department, designation] = await Promise.all([
    Settings.findOne({ key: 'company' }).lean(),
    Employee.findById(row.employee?._id || row.employee).select('name code').lean(),
    row.department ? Department.findById(row.department).select('name').lean() : null,
    row.designation ? Designation.findById(row.designation).select('name').lean() : null,
  ]);
  const buffer = await buildPayslipPdf({
    companyName: settings?.companyName || 'HCM Lite',
    employeeName: employee?.name || 'Employee',
    employeeCode: employee?.code || '',
    departmentName: department?.name || '',
    designationName: designation?.name || '',
    month: row.month,
    breakdown: row.breakdown,
  });
  const filename = `payslip-${employee?.code || 'employee'}-${row.month}.pdf`;
  return { filename, buffer };
}
