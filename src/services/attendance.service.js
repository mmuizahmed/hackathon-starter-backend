import { Attendance } from '../models/Attendance.js';
import { AttendanceCorrection } from '../models/AttendanceCorrection.js';
import { Employee } from '../models/Employee.js';
import { LeaveRequest } from '../models/LeaveRequest.js';
import { AppError } from '../utils/AppError.js';
import { distanceMeters } from '../utils/distance.js';
import { assertObjectId } from '../utils/objectId.js';
import { pageData, readPage } from '../utils/page.js';
import { addDays, karachiDateString, karachiWallTimeToUtc } from '../utils/timezone.js';
import { recordAudit } from './audit.service.js';
import { listWorkingDays } from './calendar.service.js';
import { getSettings } from './settings.service.js';
import { assertOwnEmployee, employeeScopeFilter } from './scope.service.js';

function requireLinkedEmployee(actor) {
  if (!actor.employeeId) {
    throw new AppError('No employee profile is linked to this login', 403);
  }
  return actor.employeeId;
}

// Late means strictly after office start + grace. 09:15 is on time when grace ends at 09:15.
function arrivalIsLate(checkIn, dateStr, settings) {
  const deadline = karachiWallTimeToUtc(dateStr, settings.officeStart);
  const limit = deadline.getTime() + settings.graceMinutes * 60 * 1000;
  return checkIn.getTime() > limit;
}

function decideStatus(checkIn, checkOut, dateStr, settings) {
  const late = checkIn ? arrivalIsLate(checkIn, dateStr, settings) : false;
  let status = late ? 'late' : 'present';
  let workedMinutes = null;
  if (checkIn && checkOut) {
    workedMinutes = Math.round((checkOut.getTime() - checkIn.getTime()) / 60000);
    if (workedMinutes < 0) {
      throw new AppError('Check-out is before check-in', 400);
    }
    // Half day wins over present/late. The late flag is kept separately.
    if (workedMinutes < settings.halfDayHours * 60) status = 'half_day';
  }
  return { late, status, workedMinutes };
}

// Past days with no check-out are missing_checkout on read. We do not rewrite the stored row.
export function displayStatus(row, today) {
  if (!row) return null;
  if (row.checkIn && !row.checkOut && row.date < today) return 'missing_checkout';
  return row.status;
}

function toAttendance(row, today) {
  const employeeId = row.employee?._id ? row.employee._id.toString() : row.employee.toString();
  return {
    id: row._id.toString(),
    employeeId,
    date: row.date,
    checkIn: row.checkIn,
    checkOut: row.checkOut,
    status: displayStatus(row, today),
    late: Boolean(row.late),
    source: row.source,
    location: {
      lat: row.location?.lat ?? null,
      lng: row.location?.lng ?? null,
      accuracyMeters: row.location?.accuracyMeters ?? null,
      distanceMeters: row.location?.distanceMeters ?? null,
      withinRadius: row.location?.withinRadius ?? null,
    },
    faceCount: row.faceCount ?? null,
    workedMinutes: row.workedMinutes ?? null,
  };
}

function parseClock(value, dateStr) {
  if (!value) return null;
  if (/^\d{2}:\d{2}$/.test(value)) return karachiWallTimeToUtc(dateStr, value);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new AppError('Time must be HH:mm or an ISO timestamp', 400);
  return parsed;
}

function cameraReading(input) {
  return {
    lat: input.lat ?? input.location?.lat,
    lng: input.lng ?? input.location?.lng,
    accuracy: input.accuracy ?? input.location?.accuracyMeters,
    faceCount: input.faceCount,
  };
}

async function checkCamera(input, settings) {
  const reading = cameraReading(input);
  if (reading.faceCount == null || reading.lat == null || reading.lng == null || reading.accuracy == null) {
    throw new AppError('Camera check-in needs lat, lng, accuracy, and faceCount', 400);
  }
  if (reading.faceCount !== 1) {
    throw new AppError('Exactly one face must be in the frame', 422);
  }
  if (reading.accuracy > 100) {
    throw new AppError('GPS accuracy must be 100 meters or better', 422);
  }
  if (settings.officeLat == null || settings.officeLng == null) {
    throw new AppError('Office location is not set', 422);
  }
  const distance = distanceMeters(reading.lat, reading.lng, settings.officeLat, settings.officeLng);
  if (distance > settings.radiusMeters) {
    throw new AppError('You are outside the office area', 422);
  }
  return {
    lat: reading.lat,
    lng: reading.lng,
    accuracyMeters: reading.accuracy,
    distanceMeters: Math.round(distance),
    withinRadius: true,
    faceCount: reading.faceCount,
  };
}

// `now` defaults to the server clock. Tests pass a fixed time. Routes never take a time from the client.
export async function checkIn(actor, input, now = new Date()) {
  const employeeId = requireLinkedEmployee(actor);
  const settings = await getSettings();
  const date = karachiDateString(now);
  const existing = await Attendance.findOne({ employee: employeeId, date });
  if (existing?.checkIn) throw new AppError('Already checked in today', 409);

  const source = input.source || 'web';
  let location = {
    lat: null,
    lng: null,
    accuracyMeters: null,
    distanceMeters: null,
    withinRadius: null,
  };
  let faceCount = null;
  if (source === 'camera') {
    const camera = await checkCamera(input, settings);
    location = {
      lat: camera.lat,
      lng: camera.lng,
      accuracyMeters: camera.accuracyMeters,
      distanceMeters: camera.distanceMeters,
      withinRadius: camera.withinRadius,
    };
    faceCount = camera.faceCount;
  }

  const decision = decideStatus(now, null, date, settings);
  try {
    const row = await Attendance.create({
      employee: employeeId,
      date,
      checkIn: now,
      checkOut: null,
      status: decision.status,
      late: decision.late,
      source,
      location,
      faceCount,
      workedMinutes: null,
    });
    await recordAudit({
      actorId: actor.id,
      action: 'attendance.check_in',
      entity: 'Attendance',
      entityId: row._id,
      before: null,
      after: { date, status: row.status, late: row.late, source },
    });
    return toAttendance(row, date);
  } catch (error) {
    if (error.code === 11000) throw new AppError('Already checked in today', 409);
    throw error;
  }
}

export async function checkOut(actor, input, now = new Date()) {
  const employeeId = requireLinkedEmployee(actor);
  const settings = await getSettings();
  const today = karachiDateString(now);
  let row = await Attendance.findOne({ employee: employeeId, date: today });
  if (!row?.checkIn) {
    // A shift that crosses midnight still closes the open row from yesterday.
    const yesterday = addDays(today, -1);
    row = await Attendance.findOne({
      employee: employeeId,
      date: yesterday,
      checkIn: { $ne: null },
      checkOut: null,
    });
  }
  if (!row?.checkIn) throw new AppError('Check in before checking out', 400);
  if (row.checkOut) throw new AppError('Already checked out today', 409);

  const before = { status: row.status, checkOut: row.checkOut };
  const decision = decideStatus(row.checkIn, now, row.date, settings);
  row.checkOut = now;
  row.status = decision.status;
  row.late = decision.late;
  row.workedMinutes = decision.workedMinutes;
  await row.save();
  await recordAudit({
    actorId: actor.id,
    action: 'attendance.check_out',
    entity: 'Attendance',
    entityId: row._id,
    before,
    after: { status: row.status, late: row.late, workedMinutes: row.workedMinutes },
  });
  return toAttendance(row, today);
}

async function employeeIdsForDepartment(departmentId) {
  assertObjectId(departmentId, 'department id');
  const people = await Employee.find({ department: departmentId }).select('_id');
  return people.map((row) => row._id);
}

export async function listAttendance(actor, query, today = karachiDateString()) {
  const { page, limit, skip } = readPage(query);
  const filter = { ...employeeScopeFilter(actor) };
  if (query.employeeId) {
    assertObjectId(query.employeeId, 'employee id');
    assertOwnEmployee(actor, query.employeeId);
    if (actor.role !== 'employee') filter.employee = query.employeeId;
  }
  if (query.departmentId) {
    const ids = await employeeIdsForDepartment(query.departmentId);
    if (actor.role === 'employee') {
      const allowed = ids.some((id) => String(id) === String(actor.employeeId));
      filter.employee = allowed ? actor.employeeId : { $in: [] };
    } else {
      filter.employee = { $in: ids };
    }
  }
  if (query.from || query.to) {
    filter.date = {};
    if (query.from) filter.date.$gte = query.from;
    if (query.to) filter.date.$lte = query.to;
  }

  const rows = await Attendance.find(filter).sort({ date: -1 }).limit(2000);
  const visible = rows
    .map((row) => toAttendance(row, today))
    .filter((row) => !query.status || row.status === query.status);
  return pageData(visible.slice(skip, skip + limit), visible.length, page, limit);
}

function employedOn(employee, date) {
  if (employee.joinDate && employee.joinDate > date) return false;
  if (employee.exitDate && employee.exitDate < date) return false;
  if (employee.status === 'exited' && !employee.exitDate) return false;
  return true;
}

async function dayFacts(employeeIds, start, end) {
  const [rows, leaves, workingDays] = await Promise.all([
    Attendance.find({ employee: { $in: employeeIds }, date: { $gte: start, $lte: end } }),
    LeaveRequest.find({
      employee: { $in: employeeIds },
      status: 'approved',
      startDate: { $lte: end },
      endDate: { $gte: start },
    }).select('employee startDate endDate'),
    listWorkingDays(start, end),
  ]);
  const attendanceByKey = new Map(rows.map((row) => [`${String(row.employee)}:${row.date}`, row]));
  const leaveByEmployee = new Map();
  for (const leave of leaves) {
    const key = String(leave.employee);
    if (!leaveByEmployee.has(key)) leaveByEmployee.set(key, []);
    leaveByEmployee.get(key).push(leave);
  }
  return { attendanceByKey, leaveByEmployee, working: new Set(workingDays) };
}

function coveredByLeave(leaves, date) {
  return (leaves || []).some((leave) => leave.startDate <= date && leave.endDate >= date);
}

function resolveDay(employee, date, facts, today) {
  const key = `${String(employee._id)}:${date}`;
  const row = facts.attendanceByKey.get(key);
  const onLeave = coveredByLeave(facts.leaveByEmployee.get(String(employee._id)), date);
  const workingDay = facts.working.has(date);
  if (row) {
    const view = toAttendance(row, today);
    return {
      date,
      workingDay,
      status: view.status,
      late: view.late,
      checkIn: view.checkIn,
      checkOut: view.checkOut,
      source: view.source,
      attendanceId: view.id,
    };
  }
  if (onLeave) {
    return emptyDay(date, workingDay, 'on_leave');
  }
  // Today and earlier with no row are absent. Later days stay blank so the calendar is not full of absences.
  if (workingDay && date <= today) return emptyDay(date, true, 'absent');
  return emptyDay(date, workingDay, null);
}

function emptyDay(date, workingDay, status) {
  return {
    date,
    workingDay,
    status,
    late: false,
    checkIn: null,
    checkOut: null,
    source: null,
    attendanceId: null,
  };
}

export async function dailyBoard(actor, query, today = karachiDateString()) {
  if (actor.role === 'employee') {
    throw new AppError('You do not have access to this resource', 403);
  }
  const date = query.date || today;
  const filter = {
    joinDate: { $lte: date },
    status: { $in: ['active', 'probation', 'exited'] },
  };
  if (query.departmentId) {
    assertObjectId(query.departmentId, 'department id');
    filter.department = query.departmentId;
  }
  const people = await Employee.find(filter).populate('department', 'name').sort({ name: 1 });
  const employed = people.filter((person) => employedOn(person, date));
  const facts = await dayFacts(employed.map((person) => person._id), date, date);
  const items = employed.map((person) => {
    const day = resolveDay(person, date, facts, today);
    return {
      employeeId: person._id.toString(),
      name: person.name,
      code: person.code,
      department: person.department
        ? { id: person.department._id.toString(), name: person.department.name }
        : null,
      ...day,
    };
  });
  return { date, workingDay: facts.working.has(date), items };
}

function monthBounds(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new AppError('Month must be YYYY-MM', 400);
  const [year, monthNumber] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(last).padStart(2, '0')}`,
  };
}

async function buildMonth(employeeId, month, today) {
  const employee = await Employee.findById(employeeId);
  if (!employee) throw new AppError('Employee was not found', 404);
  const { start, end } = monthBounds(month);
  const facts = await dayFacts([employee._id], start, end);
  const days = [];
  let cursor = start;
  while (cursor <= end) {
    days.push(resolveDay(employee, cursor, facts, today));
    cursor = addDays(cursor, 1);
  }
  return days;
}

export async function monthCalendar(actor, query, today = karachiDateString()) {
  let employeeId = query.employeeId || null;
  if (actor.role === 'employee') {
    if (employeeId) assertOwnEmployee(actor, employeeId);
    employeeId = actor.employeeId;
    if (!employeeId) throw new AppError('No employee profile is linked to this login', 403);
  } else if (!employeeId) {
    throw new AppError('employeeId is required', 400);
  } else {
    assertObjectId(employeeId, 'employee id');
  }
  const month = query.month || today.slice(0, 7);
  const days = await buildMonth(employeeId, month, today);
  return { month, employeeId: String(employeeId), days };
}

export async function summarizeMonth(employeeId, today = karachiDateString()) {
  const month = today.slice(0, 7);
  const days = await buildMonth(employeeId, month, today);
  const counts = {
    month,
    present: 0,
    late: 0,
    halfDay: 0,
    missingCheckout: 0,
    absent: 0,
    onLeave: 0,
    lateArrivals: 0,
  };
  for (const day of days) {
    if (day.date > today) continue;
    if (day.status === 'present') counts.present += 1;
    if (day.status === 'late') counts.late += 1;
    if (day.status === 'half_day') counts.halfDay += 1;
    if (day.status === 'missing_checkout') counts.missingCheckout += 1;
    if (day.status === 'absent') counts.absent += 1;
    if (day.status === 'on_leave') counts.onLeave += 1;
    if (day.late) counts.lateArrivals += 1;
  }
  return counts;
}

function toCorrection(row) {
  const employeeId = row.employee?._id ? row.employee._id.toString() : String(row.employee);
  return {
    id: row._id.toString(),
    employeeId,
    date: row.date,
    attendanceId: row.attendance ? String(row.attendance._id || row.attendance) : null,
    requestedCheckIn: row.requestedCheckIn,
    requestedCheckOut: row.requestedCheckOut,
    reason: row.reason,
    status: row.status,
    reviewComment: row.reviewComment || '',
    reviewedBy: row.reviewedBy ? String(row.reviewedBy._id || row.reviewedBy) : null,
    reviewedAt: row.reviewedAt,
  };
}

export async function requestCorrection(actor, input, today = karachiDateString()) {
  const employeeId = requireLinkedEmployee(actor);
  if (input.date > today) throw new AppError('Correction date cannot be in the future', 400);
  const requestedCheckIn = parseClock(input.requestedCheckIn, input.date);
  const requestedCheckOut = parseClock(input.requestedCheckOut, input.date);
  if (!requestedCheckIn && !requestedCheckOut) {
    throw new AppError('A correction needs a check-in or check-out time', 400);
  }
  if (requestedCheckIn && requestedCheckOut && requestedCheckOut < requestedCheckIn) {
    throw new AppError('Check-out is before check-in', 400);
  }
  const row = await AttendanceCorrection.create({
    employee: employeeId,
    date: input.date,
    requestedCheckIn,
    requestedCheckOut,
    reason: input.reason,
    status: 'pending',
  });
  await recordAudit({
    actorId: actor.id,
    action: 'attendanceCorrection.create',
    entity: 'AttendanceCorrection',
    entityId: row._id,
    before: null,
    after: { date: row.date, reason: row.reason },
  });
  return toCorrection(row);
}

export async function listCorrections(actor, query) {
  const { page, limit, skip } = readPage(query);
  const filter = { ...employeeScopeFilter(actor) };
  if (query.status) filter.status = query.status;
  const [rows, total] = await Promise.all([
    AttendanceCorrection.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    AttendanceCorrection.countDocuments(filter),
  ]);
  return pageData(rows.map(toCorrection), total, page, limit);
}

async function applyCorrection(correction, settings) {
  const checkIn = correction.requestedCheckIn;
  const checkOut = correction.requestedCheckOut;
  let row = await Attendance.findOne({ employee: correction.employee, date: correction.date });
  if (!row) {
    const decision = decideStatus(checkIn, checkOut, correction.date, settings);
    row = await Attendance.create({
      employee: correction.employee,
      date: correction.date,
      checkIn,
      checkOut,
      status: checkIn ? decision.status : 'present',
      late: decision.late,
      source: 'correction',
      workedMinutes: decision.workedMinutes,
    });
    return row;
  }
  const decision = decideStatus(checkIn || row.checkIn, checkOut || row.checkOut, correction.date, settings);
  if (checkIn) row.checkIn = checkIn;
  if (checkOut) row.checkOut = checkOut;
  row.status = decision.status;
  row.late = decision.late;
  row.workedMinutes = decision.workedMinutes;
  row.source = 'correction';
  await row.save();
  return row;
}

export async function reviewCorrection(actor, id, input, today = karachiDateString()) {
  assertObjectId(id, 'correction id');
  const correction = await AttendanceCorrection.findById(id);
  if (!correction) throw new AppError('Correction was not found', 404);
  if (correction.status !== 'pending') throw new AppError('Correction has already been reviewed', 409);
  const before = { status: correction.status };
  correction.status = input.decision;
  correction.reviewComment = input.comment;
  correction.reviewedBy = actor.id;
  correction.reviewedAt = new Date();

  let attendance = null;
  if (input.decision === 'approved') {
    const settings = await getSettings();
    attendance = await applyCorrection(correction, settings);
    correction.attendance = attendance._id;
  }
  await correction.save();
  await recordAudit({
    actorId: actor.id,
    action: 'attendanceCorrection.review',
    entity: 'AttendanceCorrection',
    entityId: correction._id,
    before,
    after: { status: correction.status, comment: correction.reviewComment },
  });
  return {
    correction: toCorrection(correction),
    attendance: attendance ? toAttendance(attendance, today) : null,
  };
}
