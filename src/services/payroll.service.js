import { Attendance } from '../models/Attendance.js';
import { AttendanceCorrection } from '../models/AttendanceCorrection.js';
import { Employee } from '../models/Employee.js';
import { LeaveRequest } from '../models/LeaveRequest.js';
import { PayrollRun } from '../models/PayrollRun.js';
import { Payslip } from '../models/Payslip.js';
import { SalaryStructure } from '../models/SalaryStructure.js';
import { Settings } from '../models/Settings.js';
import { AppError } from '../utils/AppError.js';
import { idString, isObjectId } from '../utils/ids.js';
import { pageData, readPage } from '../utils/page.js';
import { karachiDateString } from '../utils/timezone.js';
import { wasEmployedOn } from './attendance.service.js';
import { summarizeEmployeeAttendance } from './attendanceSummary.service.js';
import { recordAudit } from './audit.service.js';
import { listWorkingDays } from './calendar.service.js';
import { notify } from './notification.service.js';
import { buildPayslipFigures, roundMoney } from './payrollMath.js';
import { assertRole } from './scope.service.js';

// Who is paid: employed on at least one working day of the month.
// Which salary: the structure that covers the last calendar day of the month.
// A raise that starts next month must not change this month when HR regenerates the draft.

function monthPeriod(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const mm = String(monthNumber).padStart(2, '0');
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

function monthLabel(month) {
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const [year, monthNumber] = month.split('-').map(Number);
  return `${names[monthNumber - 1]} ${year}`;
}

function employedBounds(employee, periodStart, periodEnd) {
  const start = employee.joinDate > periodStart ? employee.joinDate : periodStart;
  const end = employee.exitDate && employee.exitDate < periodEnd ? employee.exitDate : periodEnd;
  if (start > end) return null;
  return { start, end };
}

async function peopleInMonth(periodStart, periodEnd) {
  const monthDays = await listWorkingDays(periodStart, periodEnd);
  const employees = await Employee.find({
    joinDate: { $lte: periodEnd },
    $or: [{ exitDate: null }, { exitDate: { $gte: periodStart } }],
  }).lean();

  const people = [];
  for (const employee of employees) {
    const bounds = employedBounds(employee, periodStart, periodEnd);
    if (!bounds) continue;
    // wasEmployedOn also drops "exited" with no exit date. Headcount already
    // ignores those rows; payroll must not pay them for the whole month.
    const employedDays = monthDays.filter(
      (day) => day >= bounds.start && day <= bounds.end && wasEmployedOn(employee, day),
    );
    if (employedDays.length === 0) continue;
    people.push({ employee, ...bounds, employedWorkingDays: employedDays.length });
  }
  return { monthDays, people };
}

async function structureCovering(employeeId, periodEnd) {
  return SalaryStructure.findOne({
    employee: employeeId,
    effectiveFrom: { $lte: periodEnd },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: periodEnd } }],
  }).sort({ effectiveFrom: -1, _id: -1 });
}

function personName(employee) {
  return { employeeId: employee._id.toString(), name: employee.name, code: employee.code };
}

export async function collectPayrollChecks(month) {
  const { start, end } = monthPeriod(month);
  const { people } = await peopleInMonth(start, end);

  const missingSalary = [];
  for (const person of people) {
    const structure = await structureCovering(person.employee._id, end);
    if (!structure) missingSalary.push(personName(person.employee));
  }

  const populationIds = people.map((person) => person.employee._id);
  const today = karachiDateString();
  const [checkoutRows, pendingLeave, pendingCorrections] = await Promise.all([
    Attendance.find({
      employee: { $in: populationIds },
      date: { $gte: start, $lte: end, $lt: today },
      $or: [{ status: 'missing_checkout' }, { checkIn: { $ne: null }, checkOut: null }],
    }).populate('employee', 'name').lean(),
    LeaveRequest.find({
      status: 'pending',
      startDate: { $lte: end },
      endDate: { $gte: start },
    }).populate('employee', 'name').lean(),
    AttendanceCorrection.find({
      status: 'pending',
      date: { $gte: start, $lte: end },
    }).populate('employee', 'name').lean(),
  ]);

  const missingCheckouts = checkoutRows.map((row) => ({
    attendanceId: row._id.toString(),
    employeeId: idString(row.employee),
    name: row.employee?.name || null,
    date: row.date,
  }));
  const pendingLeaveItems = pendingLeave.map((row) => ({
    id: row._id.toString(),
    employeeId: idString(row.employee),
    name: row.employee?.name || null,
    startDate: row.startDate,
    endDate: row.endDate,
  }));
  const pendingCorrectionItems = pendingCorrections.map((row) => ({
    id: row._id.toString(),
    employeeId: idString(row.employee),
    name: row.employee?.name || null,
    date: row.date,
  }));

  const ok = missingSalary.length === 0
    && missingCheckouts.length === 0
    && pendingLeaveItems.length === 0
    && pendingCorrectionItems.length === 0;

  return {
    ok,
    missingSalary,
    missingCheckouts,
    pendingLeave: pendingLeaveItems,
    pendingCorrections: pendingCorrectionItems,
  };
}

function checkErrors(checks) {
  const errors = [];
  for (const person of checks.missingSalary) {
    errors.push({ path: 'missingSalary', message: `${person.name} (${person.code}) has no salary structure` });
  }
  for (const row of checks.missingCheckouts) {
    errors.push({ path: 'missingCheckouts', message: `${row.name || 'Employee'} is missing a check-out on ${row.date}` });
  }
  for (const row of checks.pendingLeave) {
    errors.push({ path: 'pendingLeave', message: `${row.name || 'Employee'} has pending leave ${row.startDate} to ${row.endDate}` });
  }
  for (const row of checks.pendingCorrections) {
    errors.push({ path: 'pendingCorrections', message: `${row.name || 'Employee'} has a pending attendance correction on ${row.date}` });
  }
  return errors;
}

async function payslipSummaries(runId) {
  const rows = await Payslip.find({ payrollRun: runId }).populate('employee', 'name code').lean();
  return rows.map((row) => ({
    id: row._id.toString(),
    employeeId: idString(row.employee),
    employeeName: row.employee?.name || null,
    employeeCode: row.employee?.code || null,
    gross: row.gross,
    deductions: row.deductions,
    tax: row.tax,
    net: row.net,
    breakdown: row.breakdown,
  }));
}

async function serializeRun(run, { withPayslips }) {
  const payslips = withPayslips ? await payslipSummaries(run._id) : undefined;
  return {
    id: run._id.toString(),
    month: run.month,
    status: run.status,
    workingDays: run.workingDays,
    totals: run.totals,
    createdBy: run.createdBy ? run.createdBy.toString() : null,
    finalizedBy: run.finalizedBy ? run.finalizedBy.toString() : null,
    finalizedAt: run.finalizedAt,
    ...(withPayslips ? { payslips } : {}),
  };
}

async function requireRun(id) {
  if (!isObjectId(id)) throw new AppError('Payroll run not found', 404);
  const run = await PayrollRun.findById(id);
  if (!run) throw new AppError('Payroll run not found', 404);
  return run;
}

function assertDraft(run) {
  if (run.status === 'finalized') {
    throw new AppError('This payroll run is finalized and cannot be changed', 409);
  }
}

export async function listPayrollRuns(user, query) {
  assertRole(user, 'admin', 'hr');
  const { page, limit, skip } = readPage(query);
  const [rows, total] = await Promise.all([
    PayrollRun.find().sort({ month: -1 }).skip(skip).limit(limit).lean(),
    PayrollRun.countDocuments(),
  ]);
  const items = [];
  for (const row of rows) {
    items.push(await serializeRun(row, { withPayslips: false }));
  }
  return pageData(items, total, page, limit);
}

export async function getPayrollRun(user, id) {
  assertRole(user, 'admin', 'hr');
  const run = await requireRun(id);
  return serializeRun(run, { withPayslips: true });
}

export async function getPayrollChecks(user, id) {
  assertRole(user, 'admin', 'hr');
  const run = await requireRun(id);
  return collectPayrollChecks(run.month);
}

export async function generatePayrollRun(user, month) {
  assertRole(user, 'hr');
  const existing = await PayrollRun.findOne({ month });
  if (existing) assertDraft(existing);

  const { start, end } = monthPeriod(month);
  const { monthDays, people } = await peopleInMonth(start, end);
  const settings = await Settings.findOne({ key: 'company' }).lean();
  const latePenalty = settings?.latePenalty || { enabled: false, latesPerHalfDay: 3 };

  const figures = [];
  for (const person of people) {
    const structure = await structureCovering(person.employee._id, end);
    if (!structure) continue;
    const attendance = await summarizeEmployeeAttendance(person.employee._id, person.start, person.end);
    const slip = buildPayslipFigures({
      basic: structure.basic,
      hra: structure.allowances?.hra ?? 0,
      medical: structure.allowances?.medical ?? 0,
      other: structure.allowances?.other ?? 0,
      monthWorkingDays: monthDays.length,
      employedWorkingDays: person.employedWorkingDays,
      attendance,
      latePenalty,
      joinDate: person.employee.joinDate,
      exitDate: person.employee.exitDate,
      periodStart: start,
      periodEnd: end,
    });
    figures.push({
      employee: person.employee,
      structure,
      ...slip,
    });
  }

  const totals = {
    employees: figures.length,
    gross: roundMoney(figures.reduce((sum, row) => sum + row.gross, 0)),
    deductions: roundMoney(figures.reduce((sum, row) => sum + row.deductions, 0)),
    tax: roundMoney(figures.reduce((sum, row) => sum + row.tax, 0)),
    net: roundMoney(figures.reduce((sum, row) => sum + row.net, 0)),
  };

  let run = existing;
  const created = !run;
  if (!run) {
    run = await PayrollRun.create({
      month,
      status: 'draft',
      workingDays: monthDays.length,
      totals,
      createdBy: user.id,
    });
  } else {
    run.workingDays = monthDays.length;
    run.totals = totals;
    await run.save();
    await Payslip.deleteMany({ payrollRun: run._id });
  }

  if (figures.length > 0) {
    await Payslip.insertMany(figures.map((row) => ({
      payrollRun: run._id,
      employee: row.employee._id,
      month,
      department: row.employee.department,
      designation: row.employee.designation,
      breakdown: row.breakdown,
      gross: row.gross,
      deductions: row.deductions,
      tax: row.tax,
      net: row.net,
    })));
  }

  await recordAudit({
    actorId: user.id,
    action: 'payroll.generate',
    entity: 'PayrollRun',
    entityId: run._id,
    before: created ? null : { status: 'draft' },
    after: { month, workingDays: monthDays.length, totals, regenerated: !created },
  });

  return { run: await serializeRun(run, { withPayslips: true }), created };
}

export async function finalizePayrollRun(user, id, input) {
  assertRole(user, 'admin');
  const run = await requireRun(id);
  assertDraft(run);

  const checks = await collectPayrollChecks(run.month);
  const override = Boolean(input.override) && !checks.ok;
  if (!checks.ok && !input.override) {
    throw new AppError(
      'Payroll checks failed. Fix them or finalize with override and a reason.',
      422,
      checkErrors(checks),
    );
  }

  run.status = 'finalized';
  run.finalizedBy = user.id;
  run.finalizedAt = new Date();
  await run.save();

  await recordAudit({
    actorId: user.id,
    action: 'payroll.finalize',
    entity: 'PayrollRun',
    entityId: run._id,
    before: { status: 'draft', month: run.month },
    after: {
      status: 'finalized',
      month: run.month,
      override,
      reason: override ? input.reason : '',
      totals: run.totals,
    },
  });

  const slips = await Payslip.find({ payrollRun: run._id }).lean();
  const employees = await Employee.find({ _id: { $in: slips.map((slip) => slip.employee) } })
    .select('user name')
    .lean();
  const byId = new Map(employees.map((employee) => [employee._id.toString(), employee]));
  for (const slip of slips) {
    const employee = byId.get(slip.employee.toString());
    await notify({
      userId: employee?.user,
      title: `Payslip for ${monthLabel(run.month)}`,
      body: `Your payslip for ${run.month} is ready. Net pay is ${slip.net}.`,
      type: 'payslip',
      entity: 'Payslip',
      entityId: slip._id,
    });
  }

  return serializeRun(run, { withPayslips: true });
}
