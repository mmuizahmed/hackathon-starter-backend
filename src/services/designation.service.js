import { Designation } from '../models/Designation.js';
import { Employee } from '../models/Employee.js';
import { AppError } from '../utils/AppError.js';
import { assertObjectId } from '../utils/objectId.js';
import { pageData, readPage } from '../utils/page.js';
import { recordAudit } from './audit.service.js';

function toDesignation(row) {
  return {
    id: row._id.toString(),
    name: row.name,
    active: row.active !== false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function findOr404(id) {
  assertObjectId(id, 'designation id');
  const row = await Designation.findById(id);
  if (!row) throw new AppError('Designation was not found', 404);
  return row;
}

export async function listDesignations(query) {
  const { page, limit, skip } = readPage(query);
  const filter = {};
  if (query.active === 'true') filter.active = true;
  if (query.active === 'false') filter.active = false;
  const [rows, total] = await Promise.all([
    Designation.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
    Designation.countDocuments(filter),
  ]);
  return pageData(rows.map(toDesignation), total, page, limit);
}

export async function createDesignation(actor, input) {
  try {
    const row = await Designation.create({ name: input.name, active: true });
    await recordAudit({
      actorId: actor.id,
      action: 'designation.create',
      entity: 'Designation',
      entityId: row._id,
      before: null,
      after: toDesignation(row),
    });
    return toDesignation(row);
  } catch (error) {
    if (error.code === 11000) throw new AppError('A designation with this name already exists', 409);
    throw error;
  }
}

export async function updateDesignation(actor, id, input) {
  const row = await findOr404(id);
  const before = toDesignation(row);
  if (input.name !== undefined) row.name = input.name;
  if (input.active !== undefined) row.active = input.active;
  try {
    await row.save();
  } catch (error) {
    if (error.code === 11000) throw new AppError('A designation with this name already exists', 409);
    throw error;
  }
  await recordAudit({
    actorId: actor.id,
    action: 'designation.update',
    entity: 'Designation',
    entityId: row._id,
    before,
    after: toDesignation(row),
  });
  return toDesignation(row);
}

export async function deleteDesignation(actor, id) {
  const row = await findOr404(id);
  const used = await Employee.exists({ designation: row._id });
  if (used) {
    throw new AppError('Designation is assigned to employees', 409);
  }
  const before = toDesignation(row);
  await row.deleteOne();
  await recordAudit({
    actorId: actor.id,
    action: 'designation.delete',
    entity: 'Designation',
    entityId: row._id,
    before,
    after: null,
  });
  return { deleted: true };
}
