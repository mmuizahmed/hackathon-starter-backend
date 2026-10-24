import { Employee } from '../models/Employee.js';
import { SalaryStructure } from '../models/SalaryStructure.js';
import { AppError } from '../utils/AppError.js';
import { isObjectId } from '../utils/ids.js';
import { pageData, readPage } from '../utils/page.js';
import { addDays } from '../utils/timezone.js';
import { recordAudit } from './audit.service.js';
import { deriveStandardAllowances, roundMoney } from './payrollMath.js';
import { assertRole } from './scope.service.js';

function toSalary(row) {
  const allowances = {
    hra: row.allowances?.hra ?? 0,
    medical: row.allowances?.medical ?? 0,
    other: row.allowances?.other ?? 0,
  };
  return {
    id: row._id.toString(),
    employeeId: row.employee.toString(),
    basic: row.basic,
    allowances,
    gross: roundMoney(row.basic + allowances.hra + allowances.medical + allowances.other),
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    active: Boolean(row.active),
    createdAt: row.createdAt,
  };
}

function snapshot(row) {
  if (!row) return null;
  return {
    basic: row.basic,
    allowances: {
      hra: row.allowances?.hra ?? 0,
      medical: row.allowances?.medical ?? 0,
      other: row.allowances?.other ?? 0,
    },
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    active: Boolean(row.active),
  };
}

export async function listSalaryStructures(user, query) {
  assertRole(user, 'admin', 'hr');
  if (query.employeeId) {
    if (!isObjectId(query.employeeId)) throw new AppError('Employee not found', 404);
    const employee = await Employee.exists({ _id: query.employeeId });
    if (!employee) throw new AppError('Employee not found', 404);
  }
  const { page, limit, skip } = readPage(query);
  const filter = {};
  if (query.employeeId) filter.employee = query.employeeId;
  const [rows, total] = await Promise.all([
    SalaryStructure.find(filter).sort({ effectiveFrom: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    SalaryStructure.countDocuments(filter),
  ]);
  return pageData(rows.map(toSalary), total, page, limit);
}

// History stays. Payroll later picks the row that covers the last day of the month,
// so a raise that starts next month does not rewrite an open draft for this month.
export async function setSalaryStructure(user, employeeId, input) {
  assertRole(user, 'hr');
  if (!isObjectId(employeeId)) throw new AppError('Employee not found', 404);
  const employee = await Employee.findById(employeeId).select('_id').lean();
  if (!employee) throw new AppError('Employee not found', 404);

  const allowances = input.allowances ?? deriveStandardAllowances(input.basic);
  const current = await SalaryStructure.findOne({ employee: employeeId, active: true });
  const before = snapshot(current);

  if (current) {
    // Always the day before the new row, even when that is before this row's
    // start. Clamping it forward left both rows covering a month-end, so a
    // same-day correction could still pay the old basic.
    const dayBefore = addDays(input.effectiveFrom, -1);
    current.active = false;
    current.effectiveTo = dayBefore;
    await current.save();
  }

  let created;
  try {
    created = await SalaryStructure.create({
      employee: employeeId,
      basic: input.basic,
      allowances: {
        hra: allowances.hra,
        medical: allowances.medical,
        other: allowances.other,
      },
      effectiveFrom: input.effectiveFrom,
      effectiveTo: null,
      active: true,
    });
  } catch (error) {
    // The partial index allows one active row. Put the old one back if the insert failed.
    if (current) {
      current.active = true;
      current.effectiveTo = before?.effectiveTo ?? null;
      await current.save();
    }
    throw error;
  }

  await recordAudit({
    actorId: user.id,
    action: 'salary.update',
    entity: 'SalaryStructure',
    entityId: created._id,
    before,
    after: snapshot(created),
  });
  return toSalary(created);
}
