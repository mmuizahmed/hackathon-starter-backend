import { Holiday } from '../models/Holiday.js';
import { Settings } from '../models/Settings.js';
import { AppError } from '../utils/AppError.js';
import { addDays, isWeekend } from '../utils/timezone.js';

// Shared calendar. Leave, payroll, and dashboards import these three functions:
//   isWorkingDay(dateStr)
//   countWorkingDays(startStr, endStr)
//   listWorkingDays(startStr, endStr)
// A day is not a working day when it is in settings.weekend or it is a holiday.
// Tentative moon-sighting holidays still count until someone edits them.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SPAN_DAYS = 3660;

function assertDate(value) {
  if (!ISO_DATE.test(value)) {
    throw new AppError('Dates must be YYYY-MM-DD', 400);
  }
}

async function loadCalendar(startStr, endStr) {
  const settings = await Settings.findOne({ key: 'company' }).lean();
  if (!settings) {
    throw new AppError('Company setup is not complete', 404);
  }
  const holidays = await Holiday.find({
    date: { $gte: startStr, $lte: endStr },
  }).select('date').lean();
  return {
    weekend: Array.isArray(settings.weekend) ? settings.weekend : ['Sat', 'Sun'],
    holidays: new Set(holidays.map((row) => row.date)),
  };
}

function isWork(dateStr, weekend, holidays) {
  if (holidays.has(dateStr)) return false;
  return !isWeekend(dateStr, weekend);
}

export async function listWorkingDays(startStr, endStr) {
  assertDate(startStr);
  assertDate(endStr);
  if (startStr > endStr) return [];

  const { weekend, holidays } = await loadCalendar(startStr, endStr);
  const days = [];
  let cursor = startStr;
  let walked = 0;
  while (cursor <= endStr) {
    walked += 1;
    if (walked > MAX_SPAN_DAYS) {
      throw new AppError('Date range is too long', 400);
    }
    if (isWork(cursor, weekend, holidays)) days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

export async function countWorkingDays(startStr, endStr) {
  const days = await listWorkingDays(startStr, endStr);
  return days.length;
}

export async function isWorkingDay(dateStr) {
  assertDate(dateStr);
  const { weekend, holidays } = await loadCalendar(dateStr, dateStr);
  return isWork(dateStr, weekend, holidays);
}
