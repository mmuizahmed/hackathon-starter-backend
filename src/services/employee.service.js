import { Department } from '../models/Department.js';
import { Designation } from '../models/Designation.js';
import { Employee } from '../models/Employee.js';
import { LeaveRequest } from '../models/LeaveRequest.js';
import { LeaveType } from '../models/LeaveType.js';
import { Payslip } from '../models/Payslip.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { csvCell, parseCsv } from '../utils/csv.js';
import { assertObjectId } from '../utils/objectId.js';
import { pageData, readPage } from '../utils/page.js';
import { hashPassword, makeTemporaryPassword } from '../utils/password.js';
import { karachiDateString } from '../utils/timezone.js';
import { recordAudit } from './audit.service.js';
import { summarizeMonth } from './attendance.service.js';
import { assertOwnEmployee, employeeScopeFilter } from './scope.service.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EXPORT_HEADER = 'code,name,email,phone,address,department,designation,joinDate,status,gender,basicSalary';

function namedRef(value) {
  if (!value) return null;
  if (value._id && value.name) {
    return { id: value._id.toString(), name: value.name };
  }
  return { id: value.toString(), name: null };
}

export function toEmployee(row) {
  return {
    id: row._id.toString(),
    code: row.code,
    name: row.name,
    email: row.email,
    phone: row.phone || '',
    address: row.address || '',
    department: namedRef(row.department),
    designation: namedRef(row.designation),
    joinDate: row.joinDate,
    exitDate: row.exitDate ?? null,
    status: row.status,
    gender: row.gender,
    salary: { basic: row.salary?.basic },
    userId: row.user ? row.user.toString() : null,
    // True when a descriptor is on file. The numbers themselves are never copied out.
    faceEnrolled: Boolean(row.faceEnrolledAt),
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isRealDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

async function requireActiveDepartment(id) {
  assertObjectId(id, 'department id');
  const row = await Department.findById(id);
  if (!row || row.active === false) throw new AppError('Department was not found', 400);
  return row;
}

async function requireActiveDesignation(id) {
  assertObjectId(id, 'designation id');
  const row = await Designation.findById(id);
  if (!row || row.active === false) throw new AppError('Designation was not found', 400);
  return row;
}

function listFilter(actor, query) {
  // The employee document's own id is `_id`, not a field named `employee`.
  const filter = { ...employeeScopeFilter(actor, '_id') };
  if (query.departmentId) {
    assertObjectId(query.departmentId, 'department id');
    filter.department = query.departmentId;
  }
  if (query.designationId) {
    assertObjectId(query.designationId, 'designation id');
    filter.designation = query.designationId;
  }
  if (query.status) filter.status = query.status;
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ name: pattern }, { code: pattern }, { email: pattern }];
  }
  return filter;
}

export async function listEmployees(actor, query) {
  const { page, limit, skip } = readPage(query);
  const filter = listFilter(actor, query);
  const [rows, total] = await Promise.all([
    Employee.find(filter)
      .populate('department', 'name')
      .populate('designation', 'name')
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit),
    Employee.countDocuments(filter),
  ]);
  return pageData(rows.map(toEmployee), total, page, limit);
}

async function leaveBalances(employeeId) {
  const year = karachiDateString().slice(0, 4);
  const types = await LeaveType.find().sort({ name: 1 }).lean();
  const requests = await LeaveRequest.find({
    employee: employeeId,
    status: 'approved',
    startDate: { $lte: `${year}-12-31` },
    endDate: { $gte: `${year}-01-01` },
  }).lean();
  const usedByType = new Map();
  for (const request of requests) {
    const key = String(request.leaveType);
    usedByType.set(key, (usedByType.get(key) || 0) + (request.days || 0));
  }
  return types.map((type) => {
    const used = usedByType.get(String(type._id)) || 0;
    const quota = type.yearlyQuota ?? null;
    return {
      leaveTypeId: type._id.toString(),
      code: type.code,
      name: type.name,
      paid: type.paid,
      quota,
      used,
      remaining: quota == null ? null : quota - used,
    };
  });
}

async function lastPayslip(employeeId) {
  const slip = await Payslip.findOne({ employee: employeeId }).sort({ month: -1, createdAt: -1 });
  if (!slip) return null;
  return { id: slip._id.toString(), month: slip.month, net: slip.net };
}

export async function getEmployee(actor, id) {
  assertObjectId(id, 'employee id');
  assertOwnEmployee(actor, id);
  const row = await Employee.findById(id).populate('department', 'name').populate('designation', 'name');
  if (!row) throw new AppError('Employee was not found', 404);
  if (actor.role === 'employee' && String(row._id) !== String(actor.employeeId)) {
    throw new AppError('You can only access your own records', 403);
  }

  // Leave and payslips are owned by the other module. If those reads fail, the profile still loads.
  let balances = null;
  let payslip = null;
  let attendanceThisMonth = null;
  try {
    balances = await leaveBalances(row._id);
  } catch {
    balances = null;
  }
  try {
    payslip = await lastPayslip(row._id);
  } catch {
    payslip = null;
  }
  try {
    attendanceThisMonth = await summarizeMonth(row._id);
  } catch {
    attendanceThisMonth = null;
  }

  return {
    employee: toEmployee(row),
    attendanceThisMonth,
    leaveBalances: balances,
    lastPayslip: payslip,
  };
}

async function createWithLogin(input, actorId, source) {
  await requireActiveDepartment(input.departmentId);
  await requireActiveDesignation(input.designationId);
  const email = input.email.toLowerCase();
  const code = input.code.toUpperCase();
  if (await Employee.exists({ code })) throw new AppError('An employee with this code already exists', 409);
  if (await Employee.exists({ email }) || await User.exists({ email })) {
    throw new AppError('A login with this email already exists', 409);
  }

  const temporaryPassword = input.temporaryPassword || makeTemporaryPassword();
  const employee = await Employee.create({
    code,
    name: input.name,
    email,
    phone: input.phone || '',
    address: input.address || '',
    department: input.departmentId,
    designation: input.designationId,
    joinDate: input.joinDate,
    exitDate: null,
    status: input.status || 'active',
    gender: input.gender || 'undisclosed',
    salary: { basic: input.basicSalary },
  });

  try {
    const user = await User.create({
      name: input.name,
      email,
      passwordHash: await hashPassword(temporaryPassword),
      role: 'employee',
      active: true,
      mustChangePassword: true,
      employee: employee._id,
    });
    employee.user = user._id;
    await employee.save();
  } catch (error) {
    await Employee.deleteOne({ _id: employee._id });
    if (error.code === 11000) throw new AppError('A login with this email already exists', 409);
    throw error;
  }

  const saved = await Employee.findById(employee._id).populate('department', 'name').populate('designation', 'name');
  await recordAudit({
    actorId,
    action: 'employee.create',
    entity: 'Employee',
    entityId: saved._id,
    before: null,
    after: { code: saved.code, email: saved.email, source },
  });
  return { employee: toEmployee(saved), temporaryPassword };
}

export async function registerEmployee(actor, input) {
  return createWithLogin(input, actor.id, 'form');
}

export async function updateEmployee(actor, id, input) {
  assertObjectId(id, 'employee id');
  const row = await Employee.findById(id);
  if (!row) throw new AppError('Employee was not found', 404);

  if (actor.role === 'admin') {
    throw new AppError('You do not have access to this resource', 403);
  }
  if (actor.role === 'employee') {
    assertOwnEmployee(actor, row._id);
    const keys = Object.keys(input);
    const onlyContact = keys.length > 0 && keys.every((key) => key === 'phone' || key === 'address');
    if (!onlyContact) {
      throw new AppError('You can only change your phone and address', 403);
    }
    if (input.phone !== undefined) row.phone = input.phone;
    if (input.address !== undefined) row.address = input.address;
    await row.save();
    const saved = await Employee.findById(row._id).populate('department', 'name').populate('designation', 'name');
    await recordAudit({
      actorId: actor.id,
      action: 'employee.update',
      entity: 'Employee',
      entityId: row._id,
      before: null,
      after: { phone: saved.phone, address: saved.address },
    });
    return toEmployee(saved);
  }

  const before = toEmployee(await Employee.findById(row._id).populate('department', 'name').populate('designation', 'name'));
  if (input.departmentId) await requireActiveDepartment(input.departmentId);
  if (input.designationId) await requireActiveDesignation(input.designationId);
  if (input.code && input.code.toUpperCase() !== row.code) {
    if (await Employee.exists({ code: input.code.toUpperCase() })) {
      throw new AppError('An employee with this code already exists', 409);
    }
    row.code = input.code.toUpperCase();
  }
  if (input.email && input.email.toLowerCase() !== row.email) {
    const email = input.email.toLowerCase();
    if (await Employee.exists({ email }) || await User.exists({ email })) {
      throw new AppError('A login with this email already exists', 409);
    }
    row.email = email;
  }
  if (input.name !== undefined) row.name = input.name;
  if (input.phone !== undefined) row.phone = input.phone;
  if (input.address !== undefined) row.address = input.address;
  if (input.departmentId) row.department = input.departmentId;
  if (input.designationId) row.designation = input.designationId;
  if (input.joinDate !== undefined) row.joinDate = input.joinDate;
  if (input.gender !== undefined) row.gender = input.gender;
  if (input.basicSalary !== undefined) row.salary.basic = input.basicSalary;
  // Exiting sets the date and the login is turned off below. Active or probation clears the exit date.
  if (input.status === 'exited' || input.exitDate) {
    row.status = 'exited';
    row.exitDate = input.exitDate || row.exitDate || karachiDateString();
  } else if (input.status) {
    row.status = input.status;
    row.exitDate = null;
  }

  await row.save();
  if (row.user) {
    const user = await User.findById(row.user);
    if (user) {
      user.name = row.name;
      user.email = row.email;
      user.active = row.status !== 'exited';
      await user.save();
    }
  }

  const saved = await Employee.findById(row._id).populate('department', 'name').populate('designation', 'name');
  await recordAudit({
    actorId: actor.id,
    action: 'employee.update',
    entity: 'Employee',
    entityId: row._id,
    before,
    after: toEmployee(saved),
  });
  return toEmployee(saved);
}

function matchByName(rows, name) {
  return rows.filter((row) => row.name.toLowerCase() === name.toLowerCase());
}

export async function importEmployees(actor, csvText, { dryRun }) {
  const { headers, records } = parseCsv(csvText);
  if (headers.length === 0) throw new AppError('CSV file is empty', 400);
  const missing = ['code', 'name', 'email', 'department', 'designation', 'joindate', 'basicsalary']
    .filter((column) => !headers.includes(column));
  if (missing.length > 0) {
    return {
      ok: false,
      dryRun,
      validRows: 0,
      errors: missing.map((column) => ({ row: 1, field: column, reason: 'Missing column' })),
    };
  }

  const [departments, designations, employees, users] = await Promise.all([
    Department.find({ active: true }).lean(),
    Designation.find({ active: true }).lean(),
    Employee.find().select('code email').lean(),
    User.find().select('email').lean(),
  ]);
  const codes = new Set(employees.map((row) => row.code.toUpperCase()));
  const emails = new Set([
    ...employees.map((row) => row.email.toLowerCase()),
    ...users.map((row) => row.email.toLowerCase()),
  ]);
  const seenCodes = new Set();
  const seenEmails = new Set();
  const errors = [];
  const ready = [];

  for (const record of records) {
    const value = (column) => {
      const index = headers.indexOf(column);
      return index === -1 ? '' : (record.cells[index] || '').trim();
    };
    const rowErrors = [];
    const code = value('code').toUpperCase();
    const name = value('name');
    const email = value('email').toLowerCase();
    const departmentName = value('department');
    const designationName = value('designation');
    const joinDate = value('joindate');
    const salaryText = value('basicsalary');
    const status = (value('status') || 'active').toLowerCase();
    const gender = (value('gender') || 'undisclosed').toLowerCase();

    if (!code) rowErrors.push({ row: record.row, field: 'code', reason: 'Code is required' });
    if (!name) rowErrors.push({ row: record.row, field: 'name', reason: 'Name is required' });
    if (!email || !EMAIL.test(email)) {
      rowErrors.push({ row: record.row, field: 'email', reason: 'Email is invalid' });
    }
    if (!departmentName) {
      rowErrors.push({ row: record.row, field: 'department', reason: 'Department is required' });
    }
    if (!designationName) {
      rowErrors.push({ row: record.row, field: 'designation', reason: 'Designation is required' });
    }
    if (!isRealDate(joinDate)) {
      rowErrors.push({ row: record.row, field: 'joinDate', reason: 'Date must be YYYY-MM-DD' });
    }
    const salary = Number(salaryText);
    if (!salaryText || !Number.isFinite(salary) || salary <= 0) {
      rowErrors.push({ row: record.row, field: 'basicSalary', reason: 'Salary must be greater than 0' });
    } else if (salary < 1) {
      rowErrors.push({ row: record.row, field: 'basicSalary', reason: 'Salary must be at least 1' });
    }
    if (!['active', 'probation'].includes(status)) {
      rowErrors.push({ row: record.row, field: 'status', reason: 'Status must be active or probation' });
    }
    if (!['male', 'female', 'other', 'undisclosed'].includes(gender)) {
      rowErrors.push({ row: record.row, field: 'gender', reason: 'Gender is not valid' });
    }

    let departmentId = null;
    if (departmentName) {
      const found = matchByName(departments, departmentName);
      if (found.length === 0) {
        rowErrors.push({ row: record.row, field: 'department', reason: 'Unknown department' });
      } else if (found.length > 1) {
        rowErrors.push({ row: record.row, field: 'department', reason: 'Department name is ambiguous' });
      } else {
        departmentId = found[0]._id.toString();
      }
    }
    let designationId = null;
    if (designationName) {
      const found = matchByName(designations, designationName);
      if (found.length === 0) {
        rowErrors.push({ row: record.row, field: 'designation', reason: 'Unknown designation' });
      } else if (found.length > 1) {
        rowErrors.push({ row: record.row, field: 'designation', reason: 'Designation name is ambiguous' });
      } else {
        designationId = found[0]._id.toString();
      }
    }
    if (code && (codes.has(code) || seenCodes.has(code))) {
      rowErrors.push({ row: record.row, field: 'code', reason: 'Code already exists' });
    }
    if (email && EMAIL.test(email) && (emails.has(email) || seenEmails.has(email))) {
      rowErrors.push({ row: record.row, field: 'email', reason: 'Email already exists' });
    }

    if (rowErrors.length === 0) {
      seenCodes.add(code);
      seenEmails.add(email);
      ready.push({
        row: record.row,
        code,
        name,
        email,
        phone: value('phone'),
        address: value('address'),
        departmentId,
        designationId,
        joinDate,
        status,
        gender,
        basicSalary: salary,
      });
    }
    errors.push(...rowErrors);
  }

  if (dryRun || errors.length > 0) {
    return { ok: errors.length === 0, dryRun, validRows: ready.length, errors };
  }

  const temporaryPasswords = [];
  for (const row of ready) {
    const created = await createWithLogin(row, actor.id, 'csv');
    temporaryPasswords.push({
      row: row.row,
      email: row.email,
      temporaryPassword: created.temporaryPassword,
    });
  }
  return {
    ok: true,
    dryRun: false,
    validRows: ready.length,
    created: ready.length,
    errors: [],
    temporaryPasswords,
  };
}

export async function exportEmployees(actor, query) {
  const filter = listFilter(actor, query);
  const rows = await Employee.find(filter)
    .populate('department', 'name')
    .populate('designation', 'name')
    .sort({ name: 1 });
  const header = EXPORT_HEADER;
  const lines = rows.map((row) => [
    row.code,
    row.name,
    row.email,
    row.phone || '',
    row.address || '',
    row.department?.name || '',
    row.designation?.name || '',
    row.joinDate,
    row.status,
    row.gender,
    row.salary?.basic ?? '',
  ].map(csvCell).join(','));
  return [header, ...lines].join('\n');
}
