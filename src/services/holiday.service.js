import { Holiday } from '../models/Holiday.js';
import { AppError } from '../utils/AppError.js';
import { assertObjectId } from '../utils/objectId.js';
import { pageData, readPage } from '../utils/page.js';
import { recordAudit } from './audit.service.js';

function toHoliday(row) {
  return {
    id: row._id.toString(),
    date: row.date,
    name: row.name,
    tentative: Boolean(row.tentative),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function findOr404(id) {
  assertObjectId(id, 'holiday id');
  const row = await Holiday.findById(id);
  if (!row) throw new AppError('Holiday was not found', 404);
  return row;
}

export async function listHolidays(query) {
  const { page, limit, skip } = readPage(query);
  const filter = {};
  if (query.year) {
    filter.date = { $gte: `${query.year}-01-01`, $lte: `${query.year}-12-31` };
  }
  const [rows, total] = await Promise.all([
    Holiday.find(filter).sort({ date: 1, name: 1 }).skip(skip).limit(limit),
    Holiday.countDocuments(filter),
  ]);
  return pageData(rows.map(toHoliday), total, page, limit);
}

export async function createHoliday(actor, input) {
  const row = await Holiday.create({
    date: input.date,
    name: input.name,
    tentative: Boolean(input.tentative),
  });
  await recordAudit({
    actorId: actor.id,
    action: 'holiday.create',
    entity: 'Holiday',
    entityId: row._id,
    before: null,
    after: toHoliday(row),
  });
  return toHoliday(row);
}

export async function updateHoliday(actor, id, input) {
  const row = await findOr404(id);
  const before = toHoliday(row);
  if (input.date !== undefined) row.date = input.date;
  if (input.name !== undefined) row.name = input.name;
  if (input.tentative !== undefined) row.tentative = input.tentative;
  await row.save();
  await recordAudit({
    actorId: actor.id,
    action: 'holiday.update',
    entity: 'Holiday',
    entityId: row._id,
    before,
    after: toHoliday(row),
  });
  return toHoliday(row);
}

export async function deleteHoliday(actor, id) {
  const row = await findOr404(id);
  const before = toHoliday(row);
  await row.deleteOne();
  await recordAudit({
    actorId: actor.id,
    action: 'holiday.delete',
    entity: 'Holiday',
    entityId: row._id,
    before,
    after: null,
  });
  return { deleted: true };
}
