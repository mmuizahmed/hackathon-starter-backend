import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addDays,
  isWeekend,
  karachiDateString,
  karachiWallTimeToUtc,
  weekdayName,
} from '../src/utils/timezone.js';

test('Karachi dates stay on the local calendar day', () => {
  // 20:00 UTC is 01:00 the next day in Pakistan (UTC+5).
  const instant = new Date('2026-10-24T20:00:00.000Z');
  assert.equal(karachiDateString(instant), '2026-10-25');
  assert.equal(karachiWallTimeToUtc('2026-10-24', '09:00').toISOString(), '2026-10-24T04:00:00.000Z');
});

test('weekend helper uses the company list', () => {
  assert.equal(weekdayName('2026-10-24'), 'Sat');
  assert.equal(isWeekend('2026-10-24', ['Sat', 'Sun']), true);
  assert.equal(isWeekend('2026-10-23', ['Sat', 'Sun']), false);
  assert.equal(addDays('2026-10-24', 2), '2026-10-26');
});
