import { Attendance } from '../models/Attendance.js';
import { LeaveRequest } from '../models/LeaveRequest.js';
import { karachiDateString } from '../utils/timezone.js';
import { listWorkingDays } from './calendar.service.js';

// Same read rule as the attendance board: a past open check-in is missing_checkout.
// The stored status stays whatever check-in wrote. Payroll must not treat that day as present.
function statusForPayroll(row, today) {
  if (row.checkIn && !row.checkOut && row.date < today) return 'missing_checkout';
  return row.status;
}

// One place for "what was this day?". Payroll and the dashboards both need it.
// A stored attendance row wins, same as the daily board. Half days and lates come from that row.
// With no row, approved leave is on leave (unpaid is the payroll deduction). Otherwise a past
// working day is absent. Days after today are left blank so a mid-month draft is not all absences.

function emptyCounts() {
  return {
    presentDays: 0,
    lateDays: 0,
    halfDays: 0,
    missingCheckoutDays: 0,
    absentDays: 0,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    lateArrivals: 0,
  };
}

export async function summarizeEmployeeAttendance(employeeId, from, to) {
  const workingDays = await listWorkingDays(from, to);
  const [rows, leaves] = await Promise.all([
    Attendance.find({ employee: employeeId, date: { $gte: from, $lte: to } }).lean(),
    LeaveRequest.find({
      employee: employeeId,
      status: 'approved',
      startDate: { $lte: to },
      endDate: { $gte: from },
    }).populate('leaveType', 'code paid'),
  ]);

  const byDate = new Map(rows.map((row) => [row.date, row]));
  const counts = emptyCounts();
  const today = karachiDateString();

  for (const date of workingDays) {
    const row = byDate.get(date);
    if (row) {
      const status = statusForPayroll(row, today);
      // The late flag is the penalty input. A missing check-out can still have been a late arrival.
      if (row.late || status === 'late' || row.status === 'late') counts.lateArrivals += 1;
      switch (status) {
        case 'half_day':
          counts.halfDays += 1;
          break;
        case 'late':
          counts.lateDays += 1;
          break;
        case 'missing_checkout':
          counts.missingCheckoutDays += 1;
          break;
        case 'absent':
          counts.absentDays += 1;
          break;
        case 'on_leave':
          // A stored on_leave without an approved request is still not an absence.
          counts.paidLeaveDays += 1;
          break;
        default:
          counts.presentDays += 1;
          break;
      }
      continue;
    }

  const covering = leaves.filter((leave) => leave.startDate <= date && leave.endDate >= date);
  if (covering.length > 0) {
    // No attendance row. Unpaid wins if two requests somehow cover one day.
    const unpaid = covering.some((leave) => leave.leaveType && leave.leaveType.paid === false);
    if (unpaid) counts.unpaidLeaveDays += 1;
    else counts.paidLeaveDays += 1;
    continue;
  }

  // The board leaves future days blank. A mid-month draft must not deduct the rest of the month.
  if (date > today) continue;
  counts.absentDays += 1;
}

  return {
    from,
    to,
    workingDays: workingDays.length,
    ...counts,
    onLeaveDays: counts.paidLeaveDays + counts.unpaidLeaveDays,
  };
}
