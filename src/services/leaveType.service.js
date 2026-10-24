import { LeaveRequest } from '../models/LeaveRequest.js';
import { LeaveType } from '../models/LeaveType.js';
import { AppError } from '../utils/AppError.js';
import { assertObjectId } from '../utils/objectId.js';
import { pageData, readPage } from '../utils/page.js';
import { recordAudit } from './audit.service.js';

// Org setup for quotas. Leave requests themselves belong to the leave module.
function toLeaveType(row) {
  return {
    id: row._id.toString(),
    name: row.name,
    code: row.code,
    yearlyQuota: row.yearlyQuota ?? null,
    paid: row.paid,
    active: row.active !== false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function findOr404(id) {
  assertObjectId(id, 'leave type id');
  const row = await LeaveType.findById(id);
  if (!row) throw new AppError('Leave type was not found', 404);
  return row;
}

export async function listLeaveTypes(query) {
  const { page, limit, skip } = readPage(query);
  const [rows, total] = await Promise.all([
    LeaveType.find().sort({ name: 1 }).skip(skip).limit(limit),
    LeaveType.countDocuments(),
  ]);
  return pageData(rows.map(toLeaveType), total, page, limit);
}

export async function createLeaveType(actor, input) {
  try {
    const row = await LeaveType.create({
      name: input.name,
      code: input.code,
      yearlyQuota: input.yearlyQuota ?? null,
      paid: input.paid,
      active: true,
    });
    await recordAudit({
      actorId: actor.id,
      action: 'leaveType.create',
      entity: 'LeaveType',
      entityId: row._id,
      before: null,
      after: toLeaveType(row),
    });
    return toLeaveType(row);
  } catch (error) {
    if (error.code === 11000) throw new AppError('A leave type with this name or code already exists', 409);
    throw error;
  }
}

export async function updateLeaveType(actor, id, input) {
  const row = await findOr404(id);
  const before = toLeaveType(row);
  if (input.name !== undefined) row.name = input.name;
  if (input.code !== undefined) row.code = input.code;
  if (input.yearlyQuota !== undefined) row.yearlyQuota = input.yearlyQuota;
  if (input.paid !== undefined) row.paid = input.paid;
  if (input.active !== undefined) row.active = input.active;
  try {
    await row.save();
  } catch (error) {
    if (error.code === 11000) throw new AppError('A leave type with this name or code already exists', 409);
    throw error;
  }
  await recordAudit({
    actorId: actor.id,
    action: 'leaveType.update',
    entity: 'LeaveType',
    entityId: row._id,
    before,
    after: toLeaveType(row),
  });
  return toLeaveType(row);
}

export async function deleteLeaveType(actor, id) {
  const row = await findOr404(id);
  const used = await LeaveRequest.exists({ leaveType: row._id });
  if (used) throw new AppError('Leave type is used by leave requests', 409);
  const before = toLeaveType(row);
  await row.deleteOne();
  await recordAudit({
    actorId: actor.id,
    action: 'leaveType.delete',
    entity: 'LeaveType',
    entityId: row._id,
    before,
    after: null,
  });
  return { deleted: true };
}
