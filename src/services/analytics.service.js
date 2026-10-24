import mongoose from 'mongoose';
import { Attendance } from '../models/Attendance.js';
import { AttendanceCorrection } from '../models/AttendanceCorrection.js';
import { Employee } from '../models/Employee.js';
import { WEEKDAYS } from '../constants/weekdays.js';
import { AppError } from '../utils/AppError.js';
import { assertObjectId } from '../utils/objectId.js';
import { addDays, karachiDateString, weekdayName } from '../utils/timezone.js';
import { listAuditLogs } from './audit.service.js';
import { summarizeEmployeeAttendance } from './attendanceSummary.service.js';
import { wasEmployedOn } from './attendance.service.js';
import { listWorkingDays } from './calendar.service.js';
import { listDepartments } from './department.service.js';
import { listDesignations } from './designation.service.js';
import { getLeaveBalances, listLeaveRequests } from './leave.service.js';
import { listLeaveTypes } from './leaveType.service.js';
import { listPayrollRuns } from './payroll.service.js';
import { listPayslips } from './payslip.service.js';

// Rates are percentages rounded to 2 decimals. 0 when the denominator is 0.
function round2(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function percent(part, whole) {
  if (!whole) return 0;
  return round2((part / whole) * 100);
}

function daysBetween(start, end) {
  const [y1, m1, d1] = start.split('-').map(Number);
  const [y2, m2, d2] = end.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

export function normalizeFilters(filters = {}, today = karachiDateString()) {
  const to = filters.to || today;
  const from = filters.from || `${to.slice(0, 7)}-01`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new AppError('Dates must be YYYY-MM-DD', 400);
  }
  if (from > to) throw new AppError('from must be on or before to', 400);
  if (daysBetween(from, to) > 400) throw new AppError('Date range is too long', 400);
  return {
    from,
    to,
    departmentId: filters.departmentId || null,
    employeeId: filters.employeeId || null,
  };
}

// Employees only ever see their own id. A foreign id is refused here, not in the prompt.
export function scopeFilters(user, filters = {}, today = karachiDateString()) {
  const range = normalizeFilters(filters, today);
  if (user.role !== 'employee') return range;
  if (!user.employeeId) {
    throw new AppError('No employee profile is linked to this login', 403);
  }
  if (range.employeeId && String(range.employeeId) !== String(user.employeeId)) {
    throw new AppError('You can only access your own records', 403);
  }
  return { ...range, departmentId: null, employeeId: String(user.employeeId) };
}

function castId(value) {
  return new mongoose.Types.ObjectId(value);
}

// People who had started and had not left before this date.
// Status `exited` still counts on days before exitDate, because that field is "now".
function headcountMatch(date, departmentId, employeeId) {
  const match = {
    joinDate: { $lte: date },
    $nor: [{ status: 'exited', exitDate: null }],
    $or: [{ exitDate: null }, { exitDate: { $gte: date } }],
  };
  if (departmentId) match.department = castId(departmentId);
  if (employeeId) match._id = castId(employeeId);
  return match;
}

async function countHeadcount(date, departmentId, employeeId) {
  const [row] = await Employee.aggregate([
    { $match: headcountMatch(date, departmentId, employeeId) },
    { $count: 'count' },
  ]);
  return row?.count || 0;
}

async function peopleForRange(filters) {
  const query = {
    joinDate: { $lte: filters.to },
    $or: [{ exitDate: null }, { exitDate: { $gte: filters.from } }],
  };
  if (filters.departmentId) {
    assertObjectId(filters.departmentId, 'department id');
    query.department = filters.departmentId;
  }
  if (filters.employeeId) {
    assertObjectId(filters.employeeId, 'employee id');
    query._id = filters.employeeId;
  }
  return Employee.find(query).populate('department', 'name');
}

// Same window payroll uses: from join date through exit date, inside the filter.
function employedWindow(employee, from, to) {
  const start = employee.joinDate > from ? employee.joinDate : from;
  const end = employee.exitDate && employee.exitDate < to ? employee.exitDate : to;
  if (start > end) return null;
  return { start, end };
}

function emptyCounts() {
  return {
    present: 0,
    late: 0,
    halfDay: 0,
    missingCheckout: 0,
    absent: 0,
    onLeave: 0,
    unpaidLeaveDays: 0,
    lateArrivals: 0,
    slots: 0,
  };
}

function addCounts(total, summary) {
  total.present += summary.presentDays;
  total.late += summary.lateDays;
  total.halfDay += summary.halfDays;
  total.missingCheckout += summary.missingCheckoutDays;
  total.absent += summary.absentDays;
  total.onLeave += summary.onLeaveDays;
  total.unpaidLeaveDays += summary.unpaidLeaveDays;
  total.lateArrivals += summary.lateArrivals;
  total.slots += summary.workingDays;
  return total;
}

function rateFromCounts(counts) {
  // present + late + missing_checkout + 0.5 * half_day, over working slots minus leave.
  const numerator = counts.present + counts.late + counts.missingCheckout + (0.5 * counts.halfDay);
  const denominator = counts.slots - counts.onLeave;
  return {
    numerator: round2(numerator),
    denominator,
    attendanceRate: percent(numerator, denominator),
    // Late flag, so a late half day counts. Denominator is on-time present days plus late arrivals.
    lateRate: percent(counts.lateArrivals, counts.present + counts.lateArrivals),
  };
}

async function attendanceRows(scope) {
  const people = await peopleForRange(scope);
  const rows = [];
  for (const employee of people) {
    const window = employedWindow(employee, scope.from, scope.to);
    if (!window) continue;
    const summary = await summarizeEmployeeAttendance(employee._id, window.start, window.end);
    rows.push({ employee, summary });
  }
  return rows;
}

async function pageAll(load) {
  const items = [];
  let page = 1;
  for (;;) {
    const result = await load(page);
    items.push(...result.items);
    if (items.length >= result.total || result.items.length === 0) break;
    page += 1;
    if (page > 50) break;
  }
  return items;
}

function monthsBetween(from, to) {
  const months = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const end = to.slice(0, 7);
  while (`${year}-${String(month).padStart(2, '0')}` <= end) {
    months.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

export async function getHeadcount(user, filters = {}, today = karachiDateString()) {
  const scope = scopeFilters(user, filters, today);
  const endCount = await countHeadcount(scope.to, scope.departmentId, scope.employeeId);
  const [grouped] = await Employee.aggregate([
    { $match: headcountMatch(scope.to, scope.departmentId, scope.employeeId) },
    {
      $facet: {
        byDepartment: [
          { $group: { _id: '$department', count: { $sum: 1 } } },
          { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'dept' } },
        ],
        byGender: [
          { $group: { _id: '$gender', count: { $sum: 1 } } },
        ],
        joinDates: [
          { $project: { joinDate: 1 } },
        ],
      },
    },
  ]);
  const buckets = { '<1y': 0, '1-3y': 0, '3y+': 0 };
  for (const row of grouped?.joinDates || []) {
    const days = daysBetween(row.joinDate, scope.to);
    if (days < 365) buckets['<1y'] += 1;
    else if (days < 365 * 3) buckets['1-3y'] += 1;
    else buckets['3y+'] += 1;
  }
  return {
    headcount: endCount,
    headcountByDepartment: (grouped?.byDepartment || []).map((row) => ({
      departmentId: row._id ? String(row._id) : null,
      name: row.dept?.[0]?.name || null,
      count: row.count,
    })),
    gender: (grouped?.byGender || []).map((row) => ({ gender: row._id, count: row.count })),
    tenureBuckets: [
      { label: '<1y', count: buckets['<1y'] },
      { label: '1-3y', count: buckets['1-3y'] },
      { label: '3y+', count: buckets['3y+'] },
    ],
  };
}

export async function getAttrition(user, filters = {}, today = karachiDateString()) {
  const scope = scopeFilters(user, filters, today);
  const startCount = await countHeadcount(scope.from, scope.departmentId, scope.employeeId);
  const endCount = await countHeadcount(scope.to, scope.departmentId, scope.employeeId);
  const exitMatch = { exitDate: { $gte: scope.from, $lte: scope.to } };
  if (scope.departmentId) exitMatch.department = castId(scope.departmentId);
  if (scope.employeeId) exitMatch._id = castId(scope.employeeId);
  const [exitRow] = await Employee.aggregate([
    { $match: exitMatch },
    { $count: 'count' },
  ]);
  const exits = exitRow?.count || 0;
  const averageHeadcount = (startCount + endCount) / 2;
  return {
    exits,
    headcountAtStart: startCount,
    headcountAtEnd: endCount,
    averageHeadcount: round2(averageHeadcount),
    attritionRate: percent(exits, averageHeadcount),
  };
}

export async function getAttendanceSummary(user, filters = {}, today = karachiDateString()) {
  const scope = scopeFilters(user, filters, today);
  const rows = await attendanceRows(scope);
  const counts = rows.reduce((total, row) => addCounts(total, row.summary), emptyCounts());
  return { ...counts, ...rateFromCounts(counts) };
}

export async function getAttendanceTrend(user, filters = {}, today = karachiDateString()) {
  const scope = scopeFilters(user, filters, today);
  const people = await peopleForRange(scope);
  const days = await listWorkingDays(scope.from, scope.to);
  const trend = [];
  for (const date of days) {
    if (date > today) continue;
    const counts = emptyCounts();
    for (const employee of people) {
      if (!wasEmployedOn(employee, date)) continue;
      const summary = await summarizeEmployeeAttendance(employee._id, date, date);
      addCounts(counts, summary);
    }
    trend.push({ date, rate: rateFromCounts(counts).attendanceRate });
  }
  return trend;
}

export async function getAbsenteeismByDepartment(user, filters = {}, today = karachiDateString()) {
  const scope = scopeFilters(user, filters, today);
  const rows = await attendanceRows(scope);
  const byDept = new Map();
  for (const row of rows) {
    const dept = row.employee.department;
    const id = dept?._id ? String(dept._id) : 'none';
    if (!byDept.has(id)) {
      byDept.set(id, {
        departmentId: dept?._id ? String(dept._id) : null,
        name: dept?.name || null,
        absent: 0,
        slots: 0,
      });
    }
    const bucket = byDept.get(id);
    bucket.absent += row.summary.absentDays;
    bucket.slots += row.summary.workingDays;
  }
  return [...byDept.values()].map((row) => ({
    departmentId: row.departmentId,
    name: row.name,
    absentDays: row.absent,
    expectedDays: row.slots,
    rate: percent(row.absent, row.slots),
  }));
}

export async function getLateComers(user, filters = {}, today = karachiDateString()) {
  const scope = scopeFilters(user, filters, today);
  if (user.role === 'employee') {
    throw new AppError('You can only access your own records', 403);
  }
  const rows = await attendanceRows(scope);
  return rows
    .map((row) => ({
      employeeId: row.employee._id.toString(),
      name: row.employee.name,
      lateDays: row.summary.lateArrivals,
    }))
    .filter((row) => row.lateDays > 0)
    .sort((a, b) => b.lateDays - a.lateDays || a.name.localeCompare(b.name))
    .slice(0, 5);
}

export async function getLeaveSummary(user, filters = {}, today = karachiDateString()) {
  const scope = scopeFilters(user, filters, today);
  const [requests, types, headcount] = await Promise.all([
    pageAll((page) => listLeaveRequests(user, {
      status: 'approved',
      from: scope.from,
      to: scope.to,
      departmentId: scope.departmentId || undefined,
      employeeId: scope.employeeId || undefined,
      page,
      limit: 100,
    })),
    pageAll((page) => listLeaveTypes({ page, limit: 100 })),
    getHeadcount(user, scope, today),
  ]);
  const quotaByCode = new Map(types.map((row) => [row.code, row]));
  const deptCount = new Map(headcount.headcountByDepartment.map((row) => [row.departmentId, row.count]));
  const byType = new Map();
  const byDept = new Map();
  for (const request of requests) {
    const code = request.leaveType?.code;
    if (!code) continue;
    byType.set(code, (byType.get(code) || 0) + request.days);
    const departmentId = request.departmentId || null;
    const key = `${code}:${departmentId || ''}`;
    if (!byDept.has(key)) byDept.set(key, { code, departmentId, days: 0 });
    byDept.get(key).days += request.days;
  }
  const leaveUtilization = [];
  for (const row of byDept.values()) {
    const type = quotaByCode.get(row.code);
    if (!type || type.paid === false || type.yearlyQuota == null) continue;
    const people = deptCount.get(row.departmentId) || 0;
    const quota = type.yearlyQuota * people;
    leaveUtilization.push({
      code: row.code,
      name: type.name,
      departmentId: row.departmentId,
      approvedDays: row.days,
      quota,
      rate: percent(row.days, quota),
    });
  }
  return {
    leaveByType: [...byType.entries()].map(([code, days]) => ({ code, days })),
    leaveUtilization,
  };
}

export async function getPayrollSummary(user, filters = {}, today = karachiDateString()) {
  const scope = scopeFilters(user, filters, today);
  const slips = [];
  for (const month of monthsBetween(scope.from, scope.to)) {
    const rows = await pageAll((page) => listPayslips(user, {
      month,
      employeeId: scope.employeeId || undefined,
      page,
      limit: 100,
    }));
    slips.push(...rows);
  }
  const visible = scope.departmentId
    ? slips.filter((row) => String(row.departmentId) === String(scope.departmentId))
    : slips;
  if (user.role === 'employee') {
    const gross = visible.reduce((sum, row) => sum + row.gross, 0);
    return {
      payrollCost: round2(gross),
      net: round2(visible.reduce((sum, row) => sum + row.net, 0)),
      averageSalary: visible.length ? round2(gross / visible.length) : 0,
      payslipCount: visible.length,
      payslips: visible.map((row) => ({
        id: row.id,
        month: row.month,
        gross: row.gross,
        net: row.net,
      })),
      byDepartment: [],
      byDesignation: [],
      runs: [],
    };
  }

  const [departments, designations, runs] = await Promise.all([
    pageAll((page) => listDepartments({ page, limit: 100 })),
    pageAll((page) => listDesignations({ page, limit: 100 })),
    pageAll((page) => listPayrollRuns(user, { page, limit: 100 })),
  ]);
  const departmentName = new Map(departments.map((row) => [row.id, row.name]));
  const designationName = new Map(designations.map((row) => [row.id, row.name]));
  const byDepartment = new Map();
  const byDesignation = new Map();
  for (const slip of visible) {
    const deptKey = slip.departmentId || 'none';
    if (!byDepartment.has(deptKey)) {
      byDepartment.set(deptKey, { gross: 0, net: 0, count: 0 });
    }
    const dept = byDepartment.get(deptKey);
    dept.gross += slip.gross;
    dept.net += slip.net;
    dept.count += 1;
    const roleKey = slip.designationId || 'none';
    if (!byDesignation.has(roleKey)) byDesignation.set(roleKey, { gross: 0, count: 0 });
    const role = byDesignation.get(roleKey);
    role.gross += slip.gross;
    role.count += 1;
  }
  const gross = visible.reduce((sum, row) => sum + row.gross, 0);
  const startMonth = scope.from.slice(0, 7);
  const endMonth = scope.to.slice(0, 7);
  return {
    payrollCost: round2(gross),
    net: round2(visible.reduce((sum, row) => sum + row.net, 0)),
    averageSalary: visible.length ? round2(gross / visible.length) : 0,
    payslipCount: visible.length,
    byDepartment: [...byDepartment.entries()].map(([id, row]) => ({
      departmentId: id === 'none' ? null : id,
      name: departmentName.get(id) || null,
      gross: round2(row.gross),
      net: round2(row.net),
      averageSalary: round2(row.gross / row.count),
    })),
    byDesignation: [...byDesignation.entries()].map(([id, row]) => ({
      designationId: id === 'none' ? null : id,
      name: designationName.get(id) || null,
      gross: round2(row.gross),
      averageSalary: round2(row.gross / row.count),
    })),
    runs: runs
      .filter((run) => run.month >= startMonth && run.month <= endMonth)
      .map((run) => ({ month: run.month, status: run.status, totals: run.totals })),
  };
}

function weekBounds(today) {
  const index = WEEKDAYS.indexOf(weekdayName(today));
  const sinceMonday = index === 0 ? 6 : index - 1;
  const start = addDays(today, -sinceMonday);
  return { start, end: addDays(start, 6) };
}

export async function myDashboard(user, today = karachiDateString()) {
  if (!user.employeeId) {
    throw new AppError('No employee profile is linked to this login', 403);
  }
  const employeeId = user.employeeId;
  const { start, end } = weekBounds(today);
  const monthStart = `${today.slice(0, 7)}-01`;
  const [rows, month, balances, payslipPage, todaySummary] = await Promise.all([
    Attendance.find({ employee: employeeId, date: { $gte: start, $lte: end } }),
    summarizeEmployeeAttendance(employeeId, monthStart, today),
    getLeaveBalances(user, {}),
    listPayslips(user, { employeeId, limit: 1 }),
    summarizeEmployeeAttendance(employeeId, today, today),
  ]);
  let minutes = 0;
  let checkedIn = false;
  for (const row of rows) {
    if (row.date === today && row.checkIn) checkedIn = true;
    if (row.workedMinutes != null) minutes += row.workedMinutes;
    else if (row.checkIn && row.checkOut) {
      minutes += Math.round((row.checkOut.getTime() - row.checkIn.getTime()) / 60000);
    } else if (row.checkIn && row.date === today) {
      minutes += Math.max(0, Math.round((Date.now() - row.checkIn.getTime()) / 60000));
    }
  }
  const slip = payslipPage.items[0] || null;
  let todayStatus = null;
  if (todaySummary.onLeaveDays) todayStatus = 'on_leave';
  else if (todaySummary.missingCheckoutDays) todayStatus = 'missing_checkout';
  else if (todaySummary.halfDays) todayStatus = 'half_day';
  else if (todaySummary.lateDays) todayStatus = 'late';
  else if (todaySummary.presentDays) todayStatus = 'present';
  else if (todaySummary.absentDays) todayStatus = 'absent';
  return {
    checkedIn,
    todayStatus,
    hoursThisWeek: round2(minutes / 60),
    expectedHours: 40,
    lateCount: month.lateArrivals,
    leaveBalances: balances.items.map((row) => ({
      leaveTypeId: row.leaveTypeId,
      code: row.code,
      name: row.name,
      quota: row.quota,
      used: row.used,
      remaining: row.remaining,
    })),
    lastPayslip: slip ? { id: slip.id, month: slip.month, net: slip.net } : null,
  };
}

async function todayCards(scope, today) {
  const people = await peopleForRange({ ...scope, from: today, to: today });
  let presentToday = 0;
  let onLeaveToday = 0;
  let lateToday = 0;
  for (const person of people) {
    if (!wasEmployedOn(person, today)) continue;
    const summary = await summarizeEmployeeAttendance(person._id, today, today);
    if (summary.onLeaveDays) onLeaveToday += 1;
    else if (summary.lateArrivals || summary.lateDays) lateToday += 1;
    else if (summary.presentDays || summary.halfDays) presentToday += 1;
  }
  return { presentToday, onLeaveToday, lateToday };
}

export async function hrDashboard(user, filters = {}, today = karachiDateString()) {
  if (user.role === 'employee') {
    throw new AppError('You do not have access to this resource', 403);
  }
  const scope = scopeFilters(user, filters, today);
  const [head, cards, trend, absenteeism, leave, lateComers, pending] = await Promise.all([
    getHeadcount(user, scope, today),
    todayCards(scope, today),
    getAttendanceTrend(user, scope, today),
    getAbsenteeismByDepartment(user, scope, today),
    getLeaveSummary(user, scope, today),
    getLateComers(user, scope, today),
    listLeaveRequests(user, {
      status: 'pending',
      departmentId: scope.departmentId || undefined,
      page: 1,
      limit: 1,
    }),
  ]);
  const correctionMatch = { status: 'pending' };
  if (scope.departmentId) {
    const ids = await Employee.find({ department: scope.departmentId }).distinct('_id');
    correctionMatch.employee = { $in: ids };
  }
  const pendingCorrections = await AttendanceCorrection.countDocuments(correctionMatch);
  return {
    headcount: head.headcount,
    presentToday: cards.presentToday,
    onLeaveToday: cards.onLeaveToday,
    lateToday: cards.lateToday,
    pendingLeave: pending.total,
    pendingCorrections,
    attendanceTrend: trend,
    absenteeismByDepartment: absenteeism,
    leaveByType: leave.leaveByType,
    leaveUtilization: leave.leaveUtilization,
    topLateComers: lateComers,
  };
}

export async function adminDashboard(user, filters = {}, today = karachiDateString()) {
  if (user.role !== 'admin') {
    throw new AppError('You do not have access to this resource', 403);
  }
  const scope = scopeFilters(user, filters, today);
  const [head, attrition, attendance, payroll, audit] = await Promise.all([
    getHeadcount(user, scope, today),
    getAttrition(user, scope, today),
    getAttendanceSummary(user, scope, today),
    getPayrollSummary(user, scope, today),
    listAuditLogs({ limit: 10 }),
  ]);
  return {
    headcount: head.headcount,
    attritionRate: attrition.attritionRate,
    exits: attrition.exits,
    averageHeadcount: attrition.averageHeadcount,
    attendanceRate: attendance.attendanceRate,
    lateRate: attendance.lateRate,
    payrollCost: payroll.payrollCost,
    averageSalary: payroll.averageSalary,
    headcountByDepartment: head.headcountByDepartment,
    payrollCostByDepartment: payroll.byDepartment,
    averageSalaryByDesignation: payroll.byDesignation,
    gender: head.gender,
    tenureBuckets: head.tenureBuckets,
    audit: audit.items,
  };
}
