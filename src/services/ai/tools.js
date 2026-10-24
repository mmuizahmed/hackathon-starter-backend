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
      description: 'Search employees by name, code, or email. Employees only see themselves, and not salary.',
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

export async function runTool(user, name, args = {}) {
  if (args.employeeId) assertOwnEmployee(user, args.employeeId);
  const filters = filtersFrom(args);
  if (name === 'get_headcount') return getHeadcount(user, filters);
  if (name === 'get_attendance_summary') return getAttendanceSummary(user, filters);
  if (name === 'get_late_comers') return getLateComers(user, filters);
  if (name === 'get_leave_summary') return getLeaveSummary(user, filters);
  if (name === 'get_payroll_summary') return getPayrollSummary(user, filters);
  if (name === 'get_my_leave_balance') {
    if (!user.employeeId && user.role === 'employee') {
      throw new AppError('No employee profile is linked to this login', 403);
    }
    return getLeaveBalances(user, { employeeId: args.employeeId });
  }
  if (name === 'search_employees') {
    const page = await listEmployees(user, {
      search: args.search,
      departmentId: user.role === 'employee' ? undefined : args.departmentId,
      limit: 10,
    });
    const items = user.role === 'employee' ? page.items.map(withoutSalary) : page.items;
    return { items, total: page.total };
  }
  throw new AppError(`Unknown tool ${name}`, 400);
}

export function summarizeToolResult(result) {
  if (result?.refused) return String(result.message || 'Refused');
  const text = JSON.stringify(result);
  if (text.length <= 500) return text;
  return `${text.slice(0, 500)}…`;
}
