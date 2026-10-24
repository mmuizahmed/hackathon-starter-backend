import { Department } from '../models/Department.js';
import { Employee } from '../models/Employee.js';
import { AppError } from '../utils/AppError.js';
import { assertObjectId } from '../utils/objectId.js';
import { pageData, readPage } from '../utils/page.js';
import { recordAudit } from './audit.service.js';

function toDepartment(row) {
  return {
    id: row._id.toString(),
    name: row.name,
    active: row.active !== false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function findOr404(id) {
  assertObjectId(id, 'department id');
  const row = await Department.findById(id);
  if (!row) throw new AppError('Department was not found', 404);
  return row;
}

export async function listDepartments(query) {
  const { page, limit, skip } = readPage(query);
  const filter = {};
  if (query.active === 'true') filter.active = true;
  if (query.active === 'false') filter.active = false;
  const [rows, total] = await Promise.all([
    Department.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
    Department.countDocuments(filter),
  ]);
  return pageData(rows.map(toDepartment), total, page, limit);
}

export async function createDepartment(actor, input) {
  try {
    const row = await Department.create({ name: input.name, active: true });
    await recordAudit({
      actorId: actor.id,
      action: 'department.create',
      entity: 'Department',
      entityId: row._id,
      before: null,
      after: toDepartment(row),
    });
    return toDepartment(row);
  } catch (error) {
    if (error.code === 11000) throw new AppError('A department with this name already exists', 409);
    throw error;
  }
}

export async function updateDepartment(actor, id, input) {
  const row = await findOr404(id);
  const before = toDepartment(row);
  if (input.name !== undefined) row.name = input.name;
  if (input.active !== undefined) row.active = input.active;
  try {
    await row.save();
  } catch (error) {
    if (error.code === 11000) throw new AppError('A department with this name already exists', 409);
    throw error;
  }
  await recordAudit({
    actorId: actor.id,
    action: 'department.update',
    entity: 'Department',
    entityId: row._id,
    before,
    after: toDepartment(row),
  });
  return toDepartment(row);
}

export async function deleteDepartment(actor, id) {
  const row = await findOr404(id);
  const used = await Employee.exists({ department: row._id });
  if (used) {
    throw new AppError('Department is assigned to employees', 409);
  }
  const before = toDepartment(row);
  await row.deleteOne();
  await recordAudit({
    actorId: actor.id,
    action: 'department.delete',
    entity: 'Department',
    entityId: row._id,
    before,
    after: null,
  });
  return { deleted: true };
}
