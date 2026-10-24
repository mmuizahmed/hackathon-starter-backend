import { Announcement } from '../models/Announcement.js';
import { AppError } from '../utils/AppError.js';
import { isObjectId } from '../utils/ids.js';
import { pageData, readPage } from '../utils/page.js';
import { recordAudit } from './audit.service.js';
import { assertRole } from './scope.service.js';

function toAnnouncement(row) {
  const author = row.createdBy && row.createdBy._id ? row.createdBy : null;
  return {
    id: row._id.toString(),
    title: row.title,
    body: row.body,
    audience: row.audience,
    active: Boolean(row.active),
    createdBy: author
      ? { id: author._id.toString(), name: author.name }
      : { id: row.createdBy ? row.createdBy.toString() : null, name: null },
    createdAt: row.createdAt,
  };
}

function visibleFilter(user, query) {
  const manage = query.includeInactive && (user.role === 'admin' || user.role === 'hr');
  if (manage) {
    // Admin and HR are reviewing the board, including drafts they turned off.
    return {};
  }
  return {
    active: true,
    audience: { $in: ['all', user.role] },
  };
}

export async function listAnnouncements(user, query) {
  const { page, limit, skip } = readPage(query);
  const filter = visibleFilter(user, query);
  const [rows, total] = await Promise.all([
    Announcement.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'name')
      .lean(),
    Announcement.countDocuments(filter),
  ]);
  return pageData(rows.map(toAnnouncement), total, page, limit);
}

export async function createAnnouncement(user, input) {
  assertRole(user, 'admin', 'hr');
  const row = await Announcement.create({
    title: input.title,
    body: input.body,
    audience: input.audience,
    createdBy: user.id,
    active: true,
  });
  await recordAudit({
    actorId: user.id,
    action: 'announcement.create',
    entity: 'Announcement',
    entityId: row._id,
    before: null,
    after: { title: row.title, audience: row.audience, active: true },
  });
  const saved = await Announcement.findById(row._id).populate('createdBy', 'name').lean();
  return toAnnouncement(saved);
}

export async function updateAnnouncement(user, id, input) {
  assertRole(user, 'admin', 'hr');
  if (!isObjectId(id)) {
    throw new AppError('Announcement not found', 404);
  }
  const row = await Announcement.findById(id);
  if (!row) {
    throw new AppError('Announcement not found', 404);
  }
  const before = { title: row.title, body: row.body, audience: row.audience, active: row.active };
  if (input.title !== undefined) row.title = input.title;
  if (input.body !== undefined) row.body = input.body;
  if (input.audience !== undefined) row.audience = input.audience;
  if (input.active !== undefined) row.active = input.active;
  await row.save();
  await recordAudit({
    actorId: user.id,
    action: 'announcement.update',
    entity: 'Announcement',
    entityId: row._id,
    before,
    after: { title: row.title, body: row.body, audience: row.audience, active: row.active },
  });
  const saved = await Announcement.findById(row._id).populate('createdBy', 'name').lean();
  return toAnnouncement(saved);
}
