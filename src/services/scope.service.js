import { AppError } from '../utils/AppError.js';

// Employees may only touch rows stored with their employee id.
// That id is not the login id. User.employee points at the employee row.
// Admin and HR are not filtered. Notifications are different: filter those by user id.

export function employeeScopeFilter(user, field = 'employee') {
  if (user.role !== 'employee') {
    return {};
  }
  // A login with no employee profile must not fall through and match every row.
  if (!user.employeeId) {
    return { [field]: { $in: [] } };
  }
  return { [field]: user.employeeId };
}

export function assertOwnEmployee(user, employeeId) {
  if (user.role !== 'employee') {
    return;
  }
  if (!user.employeeId || String(user.employeeId) !== String(employeeId)) {
    throw new AppError('You can only access your own records', 403);
  }
}
