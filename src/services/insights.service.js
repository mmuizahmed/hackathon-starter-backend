import { Holiday } from '../models/Holiday.js';
import { Employee } from '../models/Employee.js';
import { AppError } from '../utils/AppError.js';
import { addDays, isWeekend, karachiDateString, weekdayName } from '../utils/timezone.js';
import { loadClassifiedDays } from './attendance.service.js';
import { getAttendanceSummary, normalizeFilters } from './analytics.service.js';
import { getSettings } from './settings.service.js';

// Rule scores, not a model. Points are fixed so a demo can explain every flag.

const BRADFORD_WATCH = 50;
const BRADFORD_CONCERN = 125;
const BRADFORD_SERIOUS = 400;

const POINTS = {
  newHire: 25,
  late: 25,
  absent: 25,
  unpaid: 15,
  pay: 10,
};

function requireHr(user) {
  if (user.role === 'employee') {
    throw new AppError('You do not have access to this resource', 403);
  }
}

function shiftMonths(dateStr, months) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)).getUTCDate();
  const clamped = Math.min(day, last);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(clamped).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function daysBetween(start, end) {
  const [y1, m1, d1] = start.split('-').map(Number);
  const [y2, m2, d2] = end.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

function bradfordLevel(score) {
  if (score >= BRADFORD_SERIOUS) return 'serious';
  if (score >= BRADFORD_CONCERN) return 'concern';
  if (score >= BRADFORD_WATCH) return 'watch';
  return null;
}

// A spell is a run of absent working days. Weekends do not split a spell.
function absencePattern(days) {
  let spells = 0;
  let absentDays = 0;
  let open = false;
  let mondayFriday = 0;
  const absentDates = [];
  for (const day of days) {
    if (!day.workingDay || !day.status) continue;
    if (day.status === 'absent') {
      if (!open) {
        spells += 1;
        open = true;
      }
      absentDays += 1;
      absentDates.push(day.date);
      const name = weekdayName(day.date);
      if (name === 'Mon' || name === 'Fri') mondayFriday += 1;
    } else {
      open = false;
    }
  }
  return { spells, absentDays, mondayFriday, absentDates };
}

function adjacentWorkingDays(holidays, weekend) {
  const nearby = new Set();
  for (const holiday of holidays) {
    let previous = addDays(holiday, -1);
    let next = addDays(holiday, 1);
    for (let step = 0; step < 14; step += 1) {
      if (!isWeekend(previous, weekend) && !holidays.includes(previous)) break;
      previous = addDays(previous, -1);
    }
    for (let step = 0; step < 14; step += 1) {
      if (!isWeekend(next, weekend) && !holidays.includes(next)) break;
      next = addDays(next, 1);
    }
    nearby.add(previous);
    nearby.add(next);
  }
  return nearby;
}

export async function absenceAnomalies(user, filters = {}, today = karachiDateString()) {
  requireHr(user);
  const range = normalizeFilters(filters, today);
  const from = shiftMonths(range.to, -12);
  const settings = await getSettings();
  const holidayRows = await Holiday.find({ date: { $gte: from, $lte: range.to } }).select('date').lean();
  const holidayDates = holidayRows.map((row) => row.date);
  const nearby = adjacentWorkingDays(holidayDates, settings.weekend);

  const query = {
    joinDate: { $lte: range.to },
    status: { $in: ['active', 'probation', 'exited'] },
  };
  if (range.departmentId) query.department = range.departmentId;
  const people = await Employee.find(query).populate('department', 'name');
  const classified = await loadClassifiedDays(people, from, range.to, today);
  const flags = [];

  for (const row of classified) {
    const pattern = absencePattern(row.days);
    const score = pattern.spells ** 2 * pattern.absentDays;
    const reasons = [];
    const level = bradfordLevel(score);
    if (level) {
      reasons.push(
        `Bradford Factor is ${score} (${pattern.spells} spells, ${pattern.absentDays} days) over 12 months.`,
      );
    }
    if (pattern.absentDays >= 3 && pattern.mondayFriday / pattern.absentDays >= 0.5) {
      reasons.push(
        `${pattern.mondayFriday} of ${pattern.absentDays} absences fall on a Monday or Friday.`,
      );
    }
    const besideHoliday = pattern.absentDates.filter((date) => nearby.has(date)).length;
    if (besideHoliday >= 2) {
      reasons.push(`Absent beside a holiday on ${besideHoliday} days.`);
    }
    if (reasons.length === 0) continue;
    flags.push({
      employeeId: row.employee._id.toString(),
      name: row.employee.name,
      department: row.employee.department
        ? { id: row.employee.department._id.toString(), name: row.employee.department.name }
        : null,
      bradford: score,
      level: level || 'pattern',
      reasons,
    });
  }

  flags.sort((a, b) => b.bradford - a.bradford || a.name.localeCompare(b.name));
  return { from, to: range.to, flags };
}

export async function attritionRisk(user, filters = {}, today = karachiDateString()) {
  requireHr(user);
  const range = normalizeFilters(filters, today);
  const people = await Employee.find({
    status: { $in: ['active', 'probation'] },
    ...(range.departmentId ? { department: range.departmentId } : {}),
  }).populate('department', 'name');

  const salariesByDept = new Map();
  for (const person of people) {
    const key = String(person.department?._id || person.department);
    if (!salariesByDept.has(key)) salariesByDept.set(key, []);
    salariesByDept.get(key).push(person.salary?.basic || 0);
  }
  const medians = new Map([...salariesByDept.entries()].map(([key, values]) => [key, median(values)]));

  const items = [];
  for (const person of people) {
    const summary = await getAttendanceSummary(
      user,
      { from: range.from, to: range.to, employeeId: person._id.toString() },
      today,
    );
    const drivers = [];
    const tenureDays = daysBetween(person.joinDate, range.to);
    if (person.status === 'probation' || tenureDays < 183) {
      drivers.push({
        key: 'tenure',
        points: POINTS.newHire,
        reason: person.status === 'probation'
          ? 'Still on probation.'
          : 'Joined less than 6 months ago.',
      });
    }
    if (summary.lateRate >= 20) {
      drivers.push({
        key: 'late',
        points: POINTS.late,
        reason: `Late arrival rate is ${summary.lateRate}% in this period.`,
      });
    }
    const absentRate = summary.slots ? Math.round((summary.absent / summary.slots) * 10000) / 100 : 0;
    if (summary.slots > 0 && absentRate >= 10) {
      drivers.push({
        key: 'absenteeism',
        points: POINTS.absent,
        reason: `Absent ${summary.absent} of ${summary.slots} expected working days (${absentRate}%).`,
      });
    }
    if (summary.unpaidLeaveDays > 0) {
      drivers.push({
        key: 'unpaidLeave',
        points: POINTS.unpaid,
        reason: `${summary.unpaidLeaveDays} unpaid leave day${summary.unpaidLeaveDays === 1 ? '' : 's'} in this period.`,
      });
    }
    const deptKey = String(person.department?._id || person.department);
    const deptMedian = medians.get(deptKey);
    const basic = person.salary?.basic || 0;
    if (deptMedian != null && basic < deptMedian) {
      drivers.push({
        key: 'salary',
        points: POINTS.pay,
        reason: `Basic salary ${basic} is below the department median ${deptMedian}.`,
      });
    }
    if (drivers.length === 0) continue;
    const score = Math.min(100, drivers.reduce((sum, driver) => sum + driver.points, 0));
    items.push({
      employeeId: person._id.toString(),
      name: person.name,
      department: person.department
        ? { id: person.department._id.toString(), name: person.department.name }
        : null,
      score,
      drivers,
    });
  }

  items.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return { from: range.from, to: range.to, items };
}
