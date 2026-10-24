import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPayslipFigures, calculateAnnualTax, deriveStandardAllowances, roundMoney } from '../src/services/payrollMath.js';

test('tax slabs meet at 600k, 1.2M, 2.4M, and 3.6M', () => {
  assert.equal(calculateAnnualTax(600000).annualTax, 0);
  assert.equal(calculateAnnualTax(600001).annualTax, 0.05);
  assert.equal(calculateAnnualTax(1200000).annualTax, 30000);
  assert.equal(calculateAnnualTax(1200001).annualTax, 30000.15);
  assert.equal(calculateAnnualTax(2400000).annualTax, 210000);
  assert.equal(calculateAnnualTax(2400001).annualTax, 210000.25);
  assert.equal(calculateAnnualTax(3600000).annualTax, 510000);
  assert.equal(calculateAnnualTax(3600001).annualTax, 510000.35);
  assert.equal(
    calculateAnnualTax(1800000).formula,
    '30000 + 0.15 * (1800000 - 1200000) = 120000; monthly = 120000 / 12',
  );
});

test('standard allowances are 40% HRA and 10% medical', () => {
  assert.deepEqual(deriveStandardAllowances(100000), { hra: 40000, medical: 10000, other: 0 });
  const custom = buildPayslipFigures({
    basic: 100,
    hra: 1,
    medical: 1,
    other: 1,
    monthWorkingDays: 22,
    employedWorkingDays: 22,
    attendance: { absentDays: 0, unpaidLeaveDays: 0, halfDays: 0, lateArrivals: 0 },
    latePenalty: { enabled: false, latesPerHalfDay: 3 },
    joinDate: '2026-01-01',
    exitDate: null,
    periodStart: '2026-10-01',
    periodEnd: '2026-10-31',
  });
  assert.equal(custom.breakdown.inputs.grossMonthly, 103);
  assert.equal(custom.gross, 103);
});

test('one absent day matches the worked payroll example', () => {
  const slip = buildPayslipFigures({
    basic: 100000,
    hra: 40000,
    medical: 10000,
    other: 0,
    monthWorkingDays: 22,
    employedWorkingDays: 22,
    attendance: {
      presentDays: 21,
      lateDays: 0,
      halfDays: 0,
      absentDays: 1,
      unpaidLeaveDays: 0,
      paidLeaveDays: 0,
      lateArrivals: 0,
    },
    latePenalty: { enabled: false, latesPerHalfDay: 3 },
    joinDate: '2026-01-01',
    exitDate: null,
    periodStart: '2026-10-01',
    periodEnd: '2026-10-31',
  });
  assert.equal(slip.breakdown.inputs.perDayRate, 6818.18);
  assert.equal(slip.gross, 150000);
  assert.equal(slip.deductions, 6818.18);
  assert.equal(slip.tax, 10000);
  assert.equal(slip.net, 133181.82);
  assert.equal(slip.breakdown.proration.applied, false);
  const absent = slip.breakdown.lines.find((line) => line.label === 'Absent deduction');
  assert.deepEqual(
    { label: absent.label, days: absent.days, perDay: absent.perDay, amount: absent.amount },
    { label: 'Absent deduction', days: 1, perDay: 6818.18, amount: 6818.18 },
  );
});

test('half days and the late penalty each deduct half a day', () => {
  const slip = buildPayslipFigures({
    basic: 100000,
    hra: 40000,
    medical: 10000,
    other: 0,
    monthWorkingDays: 22,
    employedWorkingDays: 22,
    attendance: {
      presentDays: 18,
      lateDays: 3,
      halfDays: 1,
      absentDays: 0,
      unpaidLeaveDays: 0,
      paidLeaveDays: 0,
      lateArrivals: 3,
    },
    latePenalty: { enabled: true, latesPerHalfDay: 3 },
    joinDate: '2026-01-01',
    exitDate: null,
    periodStart: '2026-10-01',
    periodEnd: '2026-10-31',
  });
  assert.equal(slip.breakdown.deductions.halfDay, 3409.09);
  assert.equal(slip.breakdown.deductions.latePenalty, 3409.09);
  assert.equal(slip.breakdown.inputs.latePenaltyHalfDays, 1);
  assert.equal(slip.deductions, 6818.18);
  assert.equal(slip.net, roundMoney(150000 - 6818.18 - 10000));
});

test('a mid-month joiner is paid for employed working days only', () => {
  const slip = buildPayslipFigures({
    basic: 100000,
    hra: 40000,
    medical: 10000,
    other: 0,
    monthWorkingDays: 22,
    employedWorkingDays: 12,
    attendance: {
      presentDays: 12,
      lateDays: 0,
      halfDays: 0,
      absentDays: 0,
      unpaidLeaveDays: 0,
      paidLeaveDays: 0,
      lateArrivals: 0,
    },
    latePenalty: { enabled: true, latesPerHalfDay: 3 },
    joinDate: '2026-10-15',
    exitDate: null,
    periodStart: '2026-10-01',
    periodEnd: '2026-10-31',
  });
  assert.equal(slip.breakdown.proration.applied, true);
  assert.equal(slip.breakdown.proration.factor, 12 / 22);
  assert.equal(slip.gross, 81818.16);
  assert.equal(slip.deductions, 0);
  assert.equal(slip.breakdown.tax.annualTax, 120000);
  assert.equal(slip.tax, 5454.55);
  assert.equal(slip.net, 76363.61);
  assert.match(slip.breakdown.tax.formula, /12 \/ 22/);
  const parts = slip.breakdown.earnings;
  assert.equal(roundMoney(parts.basic + parts.hra + parts.medical + parts.otherAllowances), parts.gross);
});
