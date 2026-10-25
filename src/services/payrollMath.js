// Pure payroll arithmetic. No database, so the same numbers can be explained
// in a test, a payslip, and later by the assistant.

export function roundMoney(value) {
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round((Math.abs(value) + Number.EPSILON) * 100)) / 100;
}

function plain(value) {
  const rounded = roundMoney(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

// Illustrative income tax slabs. The bands meet, so 1,200,000 is 30,000
// either way: 5% of the amount above 600,000, or 30,000 + 15% of zero.
export function calculateAnnualTax(annualGross) {
  const gross = roundMoney(annualGross);
  let annualTax = 0;
  let slabLabel = '0 up to 600000';
  let formula = `${plain(gross)} is within 600000, so annual tax is 0; monthly = 0 / 12`;

  if (gross > 3600000) {
    const variable = roundMoney(((gross - 3600000) * 35) / 100);
    annualTax = roundMoney(510000 + variable);
    slabLabel = '510000 + 35% above 3600000';
    formula = `510000 + 0.35 * (${plain(gross)} - 3600000) = ${plain(annualTax)}; monthly = ${plain(annualTax)} / 12`;
  } else if (gross > 2400000) {
    const variable = roundMoney(((gross - 2400000) * 25) / 100);
    annualTax = roundMoney(210000 + variable);
    slabLabel = '210000 + 25% above 2400000';
    formula = `210000 + 0.25 * (${plain(gross)} - 2400000) = ${plain(annualTax)}; monthly = ${plain(annualTax)} / 12`;
  } else if (gross > 1200000) {
    const variable = roundMoney(((gross - 1200000) * 15) / 100);
    annualTax = roundMoney(30000 + variable);
    slabLabel = '30000 + 15% above 1200000';
    formula = `30000 + 0.15 * (${plain(gross)} - 1200000) = ${plain(annualTax)}; monthly = ${plain(annualTax)} / 12`;
  } else if (gross > 600000) {
    annualTax = roundMoney(((gross - 600000) * 5) / 100);
    slabLabel = '5% above 600000';
    formula = `0.05 * (${plain(gross)} - 600000) = ${plain(annualTax)}; monthly = ${plain(annualTax)} / 12`;
  }

  return { annualGross: gross, annualTax, slabLabel, formula };
}

// HRA 40% and medical 10% make gross = 1.5 × basic when HR does not type allowances.
export function deriveStandardAllowances(basic) {
  return {
    hra: roundMoney(basic * 0.4),
    medical: roundMoney(basic * 0.1),
    other: 0,
  };
}

function allowanceNote(kind, basic, amount) {
  const expected = kind === 'hra' ? roundMoney(basic * 0.4) : roundMoney(basic * 0.1);
  if (amount === expected) {
    return kind === 'hra' ? '40% of basic' : '10% of basic';
  }
  return 'Stored allowance';
}

function chargedEarnings(monthly, chargedGross, fullMonth, employed, monthDays) {
  if (fullMonth) {
    return {
      basic: monthly.basic,
      hra: monthly.hra,
      medical: monthly.medical,
      otherAllowances: monthly.other,
      gross: monthly.gross,
    };
  }
  const factor = monthDays === 0 ? 0 : employed / monthDays;
  const hra = roundMoney(monthly.hra * factor);
  const medical = roundMoney(monthly.medical * factor);
  const otherAllowances = roundMoney(monthly.other * factor);
  // The leftover paisa sits on basic so the four lines still add up to gross.
  const basic = roundMoney(chargedGross - hra - medical - otherAllowances);
  return { basic, hra, medical, otherAllowances, gross: chargedGross };
}

// attendance counts come from summarizeEmployeeAttendance.
// Tax uses the full monthly structure × 12, then scales by employed/working days.
// Absence does not change the tax slab. It is a separate deduction.
export function buildPayslipFigures({
  basic,
  hra,
  medical,
  other,
  monthWorkingDays,
  employedWorkingDays,
  attendance,
  latePenalty,
  joinDate,
  exitDate,
  periodStart,
  periodEnd,
}) {
  const monthly = {
    basic: roundMoney(basic),
    hra: roundMoney(hra),
    medical: roundMoney(medical),
    other: roundMoney(other),
  };
  monthly.gross = roundMoney(monthly.basic + monthly.hra + monthly.medical + monthly.other);

  const W = monthWorkingDays;
  const E = employedWorkingDays;
  const perDay = W === 0 ? 0 : roundMoney(monthly.gross / W);
  const fullMonth = W > 0 && E === W;
  const chargedGross = fullMonth ? monthly.gross : roundMoney(perDay * E);

  const absentDays = attendance.absentDays ?? 0;
  const unpaidLeaveDays = attendance.unpaidLeaveDays ?? 0;
  const halfDays = attendance.halfDays ?? 0;
  const lateArrivals = attendance.lateArrivals ?? 0;
  const latesPerHalfDay = latePenalty?.latesPerHalfDay > 0 ? latePenalty.latesPerHalfDay : 3;
  const latePenaltyEnabled = Boolean(latePenalty?.enabled);
  const latePenaltyHalfDays = latePenaltyEnabled ? Math.floor(lateArrivals / latesPerHalfDay) : 0;

  const absentAmount = roundMoney(absentDays * perDay);
  const unpaidAmount = roundMoney(unpaidLeaveDays * perDay);
  const halfAmount = roundMoney(halfDays * 0.5 * perDay);
  const lateAmount = roundMoney(latePenaltyHalfDays * 0.5 * perDay);
  const deductionTotal = roundMoney(absentAmount + unpaidAmount + halfAmount + lateAmount);

  const taxInfo = calculateAnnualTax(monthly.gross * 12);
  const fullMonthlyTax = roundMoney(taxInfo.annualTax / 12);
  const chargedTax = fullMonth ? fullMonthlyTax : roundMoney(fullMonthlyTax * (W === 0 ? 0 : E / W));
  const net = roundMoney(chargedGross - deductionTotal - chargedTax);

  let formula = taxInfo.formula;
  if (!fullMonth) {
    formula = `${taxInfo.formula} = ${plain(fullMonthlyTax)}; charged = ${plain(fullMonthlyTax)} * (${E} / ${W}) = ${plain(chargedTax)}`;
  }

  const earnings = chargedEarnings(monthly, chargedGross, fullMonth, E, W);
  const share = fullMonth ? 'Monthly basic' : `${plain(monthly.basic)} × ${E}/${W}`;

  const lines = [
    { label: 'Basic', amount: earnings.basic, formula: share },
    { label: 'HRA', amount: earnings.hra, formula: allowanceNote('hra', monthly.basic, monthly.hra) },
    { label: 'Medical', amount: earnings.medical, formula: allowanceNote('medical', monthly.basic, monthly.medical) },
    { label: 'Other allowances', amount: earnings.otherAllowances, formula: 'Stored allowance' },
    { label: 'Absent deduction', days: absentDays, perDay, amount: absentAmount },
    { label: 'Unpaid leave deduction', days: unpaidLeaveDays, perDay, amount: unpaidAmount },
    { label: 'Half day deduction', days: halfDays, factor: 0.5, perDay, amount: halfAmount },
    {
      label: 'Late penalty',
      lates: lateArrivals,
      latesPerHalfDay,
      halfDays: latePenaltyHalfDays,
      perDay,
      amount: lateAmount,
      enabled: latePenaltyEnabled,
    },
    {
      label: 'Income tax',
      amount: chargedTax,
      slabLabel: taxInfo.slabLabel,
      annualTax: taxInfo.annualTax,
      formula,
    },
  ];

  const breakdown = {
    inputs: {
      basic: monthly.basic,
      hra: monthly.hra,
      medical: monthly.medical,
      otherAllowances: monthly.other,
      grossMonthly: monthly.gross,
      annualGross: taxInfo.annualGross,
      workingDays: W,
      employedWorkingDays: E,
      presentDays: attendance.presentDays ?? 0,
      lateDays: attendance.lateDays ?? 0,
      halfDays,
      absentDays,
      unpaidLeaveDays,
      paidLeaveDays: attendance.paidLeaveDays ?? 0,
      missingCheckoutDays: attendance.missingCheckoutDays ?? 0,
      lateArrivals,
      latePenaltyEnabled,
      latesPerHalfDay,
      latePenaltyHalfDays,
      perDayRate: perDay,
      joinDate: joinDate ?? null,
      exitDate: exitDate ?? null,
      periodStart,
      periodEnd,
    },
    earnings,
    deductions: {
      absent: absentAmount,
      unpaidLeave: unpaidAmount,
      halfDay: halfAmount,
      latePenalty: lateAmount,
      total: deductionTotal,
    },
    tax: {
      annualGross: taxInfo.annualGross,
      slabLabel: taxInfo.slabLabel,
      annualTax: taxInfo.annualTax,
      monthlyTax: chargedTax,
      formula,
    },
    net,
    proration: {
      applied: !fullMonth,
      employedWorkingDays: E,
      monthWorkingDays: W,
      factor: W === 0 ? 0 : E / W,
    },
    lines,
  };

  return {
    gross: earnings.gross,
    deductions: deductionTotal,
    tax: chargedTax,
    net,
    breakdown,
  };
}
