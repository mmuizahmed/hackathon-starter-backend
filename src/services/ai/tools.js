import { AppError } from '../../utils/AppError.js';
import { assertOwnEmployee } from '../scope.service.js';
import { listEmployees } from '../employee.service.js';
import {
  getAttendanceSummary,
  getHeadcount,
  getLateComers,
  getLeaveSummary,
  getPayrollSummary,
} from '../analytics.service.js';
import { getLeaveBalances } from '../leave.service.js';

// Each tool calls the same service function the REST route uses, with req.user.
// Face descriptors are biometric data. Strip them before a result is returned or summarized.
export const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'get_headcount',
      description: 'Headcount on the end date, plus department, gender, and tenure buckets. Employees only receive their own count.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'YYYY-MM-DD' },
          to: { type: 'string', description: 'YYYY-MM-DD' },
          departmentId: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_attendance_summary',
      description: 'Attendance rate and late rate for the date range. Uses the same day labels as the attendance board.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          departmentId: { type: 'string' },
          employeeId: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_late_comers',
      description: 'Top 5 people by late arrivals in the range. Not available to an employee login.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          departmentId: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_leave_summary',
      description: 'Approved leave days and utilization by type and department.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          departmentId: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_my_leave_balance',
      description: 'Leave remaining for the signed-in employee, or for employeeId when the caller is HR or admin.',
      parameters: {
        type: 'object',
        properties: {
          employeeId: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_payroll_summary',
      description: 'Payroll gross, net, and average salary. An employee receives only their own payslips. Asking for someone else is refused.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          departmentId: { type: 'string' },
          employeeId: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_employees',
      description: 'Search employees by name, code, or email. Employees only see themselves, and not salary. Face descriptors are never included.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string' },
          employeeId: { type: 'string' },
          departmentId: { type: 'string' },
        },
      },
    },
  },
];

function filtersFrom(args) {
  return {
    from: args.from,
    to: args.to,
    departmentId: args.departmentId,
    employeeId: args.employeeId,
  };
}

function withoutSalary(row) {
  const copy = { ...row };
  delete copy.salary;
  return copy;
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// Drop embedding fields from plain JSON. Leave dates and ids alone.
export function omitFaceSecrets(value) {
  if (Array.isArray(value)) return value.map(omitFaceSecrets);
  if (!isPlainObject(value)) return value;
  const copy = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'faceDescriptor' || key === 'descriptor' || key === 'embedding') continue;
    copy[key] = omitFaceSecrets(item);
  }
  return copy;
}

export async function runTool(user, name, args = {}) {
  if (args.employeeId) assertOwnEmployee(user, args.employeeId);
  const filters = filtersFrom(args);
  let result;
  if (name === 'get_headcount') result = await getHeadcount(user, filters);
  else if (name === 'get_attendance_summary') result = await getAttendanceSummary(user, filters);
  else if (name === 'get_late_comers') result = await getLateComers(user, filters);
  else if (name === 'get_leave_summary') result = await getLeaveSummary(user, filters);
  else if (name === 'get_payroll_summary') result = await getPayrollSummary(user, filters);
  else if (name === 'get_my_leave_balance') {
    if (!user.employeeId && user.role === 'employee') {
      throw new AppError('No employee profile is linked to this login', 403);
    }
    result = await getLeaveBalances(user, { employeeId: args.employeeId });
  } else if (name === 'search_employees') {
    const page = await listEmployees(user, {
      search: args.search,
      departmentId: user.role === 'employee' ? undefined : args.departmentId,
      limit: 10,
    });
    const items = user.role === 'employee' ? page.items.map(withoutSalary) : page.items;
    result = { items, total: page.total };
  } else {
    throw new AppError(`Unknown tool ${name}`, 400);
  }
  return omitFaceSecrets(result);
}

export function summarizeToolResult(result) {
  const safe = omitFaceSecrets(result);
  if (safe?.refused) return String(safe.message || 'Refused');
  const text = JSON.stringify(safe);
  if (text.length <= 500) return text;
  return `${text.slice(0, 500)}…`;
}
