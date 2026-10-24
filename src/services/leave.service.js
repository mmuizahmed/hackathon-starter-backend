import { Employee } from '../models/Employee.js';
import { Holiday } from '../models/Holiday.js';
import { LeaveRequest } from '../models/LeaveRequest.js';
import { LeaveType } from '../models/LeaveType.js';
import { AppError } from '../utils/AppError.js';
import { idString, isObjectId } from '../utils/ids.js';
import { pageData, readPage } from '../utils/page.js';
import { karachiDateString } from '../utils/timezone.js';
import { recordAudit } from './audit.service.js';
import { countWorkingDays } from './calendar.service.js';
import { notify } from './notification.service.js';
import { assertOwnEmployee, assertRole } from './scope.service.js';

// Balance uses the day count stored on the request, not a fresh count.
// A later change to the weekend must not rewrite leave that was already applied.
// The year is the year of the start date.

function yearOf(dateStr) {
  return Number(dateStr.slice(0, 4));
}

async function sumLeaveDays(employeeId, leaveTypeId, year, status) {
  const rows = await LeaveRequest.find({
    employee: employeeId,
    leaveType: leaveTypeId,
    status,
    startDate: { $gte: `${year}-01-01`, $lte: `${year}-12-31` },
  }).select('days').lean();
  return rows.reduce((total, row) => total + row.days, 0);
}

async function assertNoOverlap(employeeId, startDate, endDate, exceptId) {
  const filter = {
    employee: employeeId,
    status: { $in: ['pending', 'approved'] },
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  };
  if (exceptId) filter._id = { $ne: exceptId };
  const other = await LeaveRequest.findOne(filter).lean();
  if (other) {
    throw new AppError(
      `These dates overlap leave that is already ${other.status} (${other.startDate} to ${other.endDate})`,
      422,
    );
  }
}

async function assertWithinBalance(employeeId, leaveType, year, days, exceptId) {
  if (leaveType.yearlyQuota == null) return;
  let used = await sumLeaveDays(employeeId, leaveType._id, year, 'approved');
  if (exceptId) {
    const current = await LeaveRequest.findById(exceptId).select('days status startDate').lean();
    if (current && current.status === 'approved' && yearOf(current.startDate) === year) {
      used -= current.days;
    }
  }
  const remaining = leaveType.yearlyQuota - used;
  if (days > remaining) {
    throw new AppError(
      `Not enough ${leaveType.name.toLowerCase()} leave. This request needs ${days} working days but only ${remaining} remain.`,
      422,
    );
  }
}

function resolveBalanceEmployee(user, employeeId) {
  if (user.role === 'employee') {
    if (employeeId) assertOwnEmployee(user, employeeId);
    if (!user.employeeId) {
      throw new AppError('You can only access your own records', 403);
    }
    return user.employeeId;
  }
  if (employeeId) return employeeId;
  if (user.role === 'hr' && user.employeeId) return user.employeeId;
  throw new AppError('employeeId is required', 400);
}

export async function getLeaveBalances(user, query) {
  const employeeId = resolveBalanceEmployee(user, query.employeeId);
  if (!isObjectId(employeeId)) {
    throw new AppError('Employee not found', 404);
  }
  const employee = await Employee.findById(employeeId).select('_id').lean();
  if (!employee) throw new AppError('Employee not found', 404);

  const year = query.year || Number(karachiDateString().slice(0, 4));
  const types = await LeaveType.find({ active: true }).sort({ code: 1 }).lean();
  const items = [];
  for (const leaveType of types) {
    const used = await sumLeaveDays(employeeId, leaveType._id, year, 'approved');
    const pending = await sumLeaveDays(employeeId, leaveType._id, year, 'pending');
    const unlimited = leaveType.yearlyQuota == null;
    items.push({
      code: leaveType.code,
      name: leaveType.name,
      paid: leaveType.paid,
      quota: unlimited ? null : leaveType.yearlyQuota,
      used,
      pending,
      remaining: unlimited ? null : leaveType.yearlyQuota - used,
    });
  }
  return { year, employeeId: String(employeeId), items };
}

function toLeave(row, context) {
  const employee = row.employee && row.employee._id ? row.employee : null;
  const leaveType = row.leaveType && row.leaveType._id ? row.leaveType : null;
  const reviewer = row.reviewedBy && row.reviewedBy._id ? row.reviewedBy : null;
  const item = {
    id: row._id.toString(),
    employeeId: employee ? employee._id.toString() : idString(row.employee),
    employeeName: employee ? employee.name : null,
    employeeCode: employee ? employee.code : null,
    departmentId: employee ? idString(employee.department) : null,
    leaveType: leaveType
      ? { id: leaveType._id.toString(), code: leaveType.code, name: leaveType.name, paid: leaveType.paid }
      : { id: idString(row.leaveType), code: null, name: null, paid: null },
    startDate: row.startDate,
    endDate: row.endDate,
    days: row.days,
    reason: row.reason,
    status: row.status,
    reviewComment: row.reviewComment || '',
    reviewedAt: row.reviewedAt,
    reviewedBy: reviewer ? { id: reviewer._id.toString(), name: reviewer.name } : null,
    createdAt: row.createdAt,
  };
  if (context) item.context = context;
  return item;
}

async function loadLeave(id) {
  if (!isObjectId(id)) throw new AppError('Leave request not found', 404);
  const row = await LeaveRequest.findById(id)
    .populate('employee', 'name code department user')
    .populate('leaveType', 'name code paid yearlyQuota')
    .populate('reviewedBy', 'name');
  if (!row) throw new AppError('Leave request not found', 404);
  return row;
}

async function buildContext(row) {
  const leaveType = row.leaveType;
  const employee = row.employee;
  const year = yearOf(row.startDate);
  const unlimited = !leaveType || leaveType.yearlyQuota == null;
  const used = leaveType ? await sumLeaveDays(row.employee._id || row.employee, leaveType._id, year, 'approved') : 0;
  const pendingSum = leaveType
    ? await sumLeaveDays(row.employee._id || row.employee, leaveType._id, year, 'pending')
    : 0;
  const pending = row.status === 'pending' ? pendingSum - row.days : pendingSum;
  const remaining = unlimited || !leaveType ? null : leaveType.yearlyQuota - used;
  let before = remaining;
  let after = remaining;
  if (!unlimited && row.status === 'pending') after = remaining - row.days;
  if (!unlimited && row.status === 'approved') before = remaining + row.days;

  const employeeId = row.employee._id || row.employee;
  const departmentId = employee?.department;
  const [holidays, colleagues, approved] = await Promise.all([
    Holiday.find({ date: { $gte: row.startDate, $lte: row.endDate } }).sort({ date: 1 }).lean(),
    departmentId
      ? LeaveRequest.find({
        employee: {
          $in: await Employee.find({ department: departmentId, _id: { $ne: employeeId } }).distinct('_id'),
        },
        status: 'approved',
        startDate: { $lte: row.endDate },
        endDate: { $gte: row.startDate },
      }).populate('employee', 'name').populate('leaveType', 'code')
      : [],
    LeaveRequest.find({
      employee: employeeId,
      status: 'approved',
      startDate: { $gte: `${year}-01-01`, $lte: `${year}-12-31` },
    }).populate('leaveType', 'code').sort({ startDate: 1 }).lean(),
  ]);

  return {
    balance: {
      quota: unlimited || !leaveType ? null : leaveType.yearlyQuota,
      used,
      pending,
      remaining,
      before,
      after,
    },
    holidays: holidays.map((holiday) => ({
      date: holiday.date,
      name: holiday.name,
      tentative: Boolean(holiday.tentative),
    })),
    colleaguesOnLeave: colleagues.map((leave) => ({
      employeeId: idString(leave.employee),
      name: leave.employee?.name || null,
      startDate: leave.startDate,
      endDate: leave.endDate,
      days: leave.days,
      code: leave.leaveType?.code || null,
    })),
    approvedThisYear: approved.map((leave) => ({
      id: leave._id.toString(),
      code: leave.leaveType?.code || null,
      startDate: leave.startDate,
      endDate: leave.endDate,
      days: leave.days,
    })),
  };
}

function requestFilter(user, query, departmentEmployeeIds) {
  const filter = {};
  if (user.role === 'employee') {
    if (!user.employeeId) return { employee: { $in: [] } };
    if (query.employeeId) assertOwnEmployee(user, query.employeeId);
    filter.employee = user.employeeId;
  } else if (query.employeeId && departmentEmployeeIds) {
    const allowed = departmentEmployeeIds.some((id) => String(id) === String(query.employeeId));
    filter.employee = allowed ? query.employeeId : { $in: [] };
  } else if (query.employeeId) {
    filter.employee = query.employeeId;
  } else if (departmentEmployeeIds) {
    filter.employee = { $in: departmentEmployeeIds };
  }
  if (query.status) filter.status = query.status;
  if (query.from) filter.endDate = { ...(filter.endDate || {}), $gte: query.from };
  if (query.to) filter.startDate = { ...(filter.startDate || {}), $lte: query.to };
  return filter;
}

export async function listLeaveRequests(user, query) {
  const { page, limit, skip } = readPage(query);
  let departmentEmployeeIds = null;
  if (query.departmentId && user.role !== 'employee') {
    departmentEmployeeIds = await Employee.find({ department: query.departmentId }).distinct('_id');
  }
  const filter = requestFilter(user, query, departmentEmployeeIds);
  const [rows, total] = await Promise.all([
    LeaveRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('employee', 'name code department')
      .populate('leaveType', 'name code paid yearlyQuota')
      .populate('reviewedBy', 'name'),
    LeaveRequest.countDocuments(filter),
  ]);

  // Colleague names stay on the HR inbox. An employee list is only their own rows.
  const showContext = user.role === 'admin' || user.role === 'hr';
  const items = [];
  for (const row of rows) {
    const context = showContext ? await buildContext(row) : undefined;
    items.push(toLeave(row, context));
  }
  return pageData(items, total, page, limit);
}

async function assertEmploymentWindow(employee, startDate, endDate) {
  if (startDate < employee.joinDate) {
    throw new AppError('Leave cannot start before the join date', 422);
  }
  if (employee.exitDate && endDate > employee.exitDate) {
    throw new AppError('Leave must end on or before the exit date', 422);
  }
}

export async function applyLeave(user, input) {
  if (user.role !== 'employee' && user.role !== 'hr') {
    throw new AppError('You do not have access to this resource', 403);
  }
  if (!user.employeeId) {
    throw new AppError('You do not have an employee profile', 403);
  }
  const employee = await Employee.findById(user.employeeId);
  if (!employee) throw new AppError('You do not have an employee profile', 403);

  const leaveType = await LeaveType.findById(input.leaveTypeId);
  if (!leaveType) throw new AppError('Leave type not found', 404);
  if (!leaveType.active) throw new AppError('This leave type is not active', 422);

  await assertEmploymentWindow(employee, input.startDate, input.endDate);
  const days = await countWorkingDays(input.startDate, input.endDate);
  if (days === 0) {
    throw new AppError('The selected dates contain no working days', 422);
  }
  await assertNoOverlap(employee._id, input.startDate, input.endDate);
  await assertWithinBalance(employee._id, leaveType, yearOf(input.startDate), days);

  const row = await LeaveRequest.create({
    employee: employee._id,
    leaveType: leaveType._id,
    startDate: input.startDate,
    endDate: input.endDate,
    days,
    reason: input.reason,
    status: 'pending',
  });
  await recordAudit({
    actorId: user.id,
    action: 'leave.apply',
    entity: 'LeaveRequest',
    entityId: row._id,
    before: null,
    after: {
      employeeId: employee._id.toString(),
      code: leaveType.code,
      startDate: row.startDate,
      endDate: row.endDate,
      days,
    },
  });
  return toLeave(await loadLeave(row._id));
}

export async function cancelLeave(user, id) {
  const row = await loadLeave(id);
  const ownerId = row.employee?._id || row.employee;
  // Cancel is own-only for every role. HR approves; they do not cancel someone else's row.
  if (!user.employeeId || String(user.employeeId) !== String(ownerId)) {
    throw new AppError('You can only access your own records', 403);
  }
  const today = karachiDateString();
  const futureApproved = row.status === 'approved' && row.startDate > today;
  if (row.status !== 'pending' && !futureApproved) {
    throw new AppError('Only pending leave, or approved leave that has not started, can be cancelled', 422);
  }
  const before = { status: row.status };
  row.status = 'cancelled';
  await row.save();
  await recordAudit({
    actorId: user.id,
    action: 'leave.cancel',
    entity: 'LeaveRequest',
    entityId: row._id,
    before,
    after: { status: 'cancelled' },
  });
  return toLeave(await loadLeave(row._id));
}

export async function reviewLeave(user, id, input) {
  assertRole(user, 'hr');
  const row = await loadLeave(id);
  if (row.status !== 'pending') {
    throw new AppError('This leave request has already been reviewed', 409);
  }
  if (input.decision === 'approved') {
    const employeeId = row.employee._id || row.employee;
    await assertNoOverlap(employeeId, row.startDate, row.endDate, row._id);
    await assertWithinBalance(employeeId, row.leaveType, yearOf(row.startDate), row.days, row._id);
  }

  const before = { status: row.status, reviewComment: row.reviewComment || '' };
  row.status = input.decision;
  row.reviewComment = input.comment || '';
  row.reviewedBy = user.id;
  row.reviewedAt = new Date();
  await row.save();

  await recordAudit({
    actorId: user.id,
    action: 'leave.review',
    entity: 'LeaveRequest',
    entityId: row._id,
    before,
    after: { status: row.status, reviewComment: row.reviewComment },
  });

  const employeeUserId = row.employee?.user;
  const code = row.leaveType?.code || 'Leave';
  await notify({
    userId: employeeUserId,
    title: input.decision === 'approved' ? 'Leave approved' : 'Leave rejected',
    body: input.decision === 'approved'
      ? `${code} leave from ${row.startDate} to ${row.endDate} was approved.`
      : `${code} leave from ${row.startDate} to ${row.endDate} was rejected. ${row.reviewComment}`,
    type: 'leave',
    entity: 'LeaveRequest',
    entityId: row._id,
  });

  const saved = await loadLeave(row._id);
  return toLeave(saved, await buildContext(saved));
}
