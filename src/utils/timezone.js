import { WEEKDAYS } from '../constants/weekdays.js';

export const TIMEZONE = 'Asia/Karachi';

// Pakistan Standard Time is UTC+5 and does not use daylight saving.
// Business dates are YYYY-MM-DD in this zone so a check-in just after midnight
// PKT is not stored as the previous UTC day.
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

export function karachiDateString(date = new Date()) {
  const pkt = new Date(date.getTime() + PKT_OFFSET_MS);
  const year = pkt.getUTCFullYear();
  const month = String(pkt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(pkt.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function karachiTimeString(date = new Date()) {
  const pkt = new Date(date.getTime() + PKT_OFFSET_MS);
  const hour = String(pkt.getUTCHours()).padStart(2, '0');
  const minute = String(pkt.getUTCMinutes()).padStart(2, '0');
  return `${hour}:${minute}`;
}

// dateStr is YYYY-MM-DD and timeStr is HH:mm, both as a Karachi wall clock.
export function karachiWallTimeToUtc(dateStr, timeStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - 5, minute, 0, 0));
}

export function weekdayName(dateStr) {
  const noon = karachiWallTimeToUtc(dateStr, '12:00');
  return WEEKDAYS[noon.getUTCDay()];
}

export function isWeekend(dateStr, weekendDays) {
  return weekendDays.includes(weekdayName(dateStr));
}

export function addDays(dateStr, days) {
  const date = karachiWallTimeToUtc(dateStr, '12:00');
  date.setUTCDate(date.getUTCDate() + days);
  return karachiDateString(date);
}
