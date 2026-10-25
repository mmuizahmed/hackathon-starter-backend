// Written only when an admin finishes first-run setup.
// Default company leave rules created at setup. Not sample data.
export const DEFAULT_LEAVE_TYPES = [
  { name: 'Annual', code: 'ANNUAL', yearlyQuota: 14, paid: true },
  { name: 'Sick', code: 'SICK', yearlyQuota: 8, paid: true },
  { name: 'Casual', code: 'CASUAL', yearlyQuota: 10, paid: true },
  { name: 'Unpaid', code: 'UNPAID', yearlyQuota: null, paid: false },
];
