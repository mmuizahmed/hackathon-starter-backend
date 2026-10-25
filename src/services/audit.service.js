import { AuditLog } from '../models/AuditLog.js';
import { pageData, readPage } from '../utils/page.js';

// Services call this after a real change. Login and logout are not audited.
// Do not pass passwordHash or a face descriptor in before or after.
export async function recordAudit({ actorId, action, entity, entityId, before, after }) {
  await AuditLog.create({
    actor: actorId || null,
    action,
    entity,
    entityId: entityId ? String(entityId) : '',
    before: before ?? null,
    after: after ?? null,
    timestamp: new Date(),
  });
}

function toAuditItem(row) {
  let actor = null;
  if (row.actor && row.actor._id) {
    actor = {
      id: row.actor._id.toString(),
      name: row.actor.name,
      email: row.actor.email,
      role: row.actor.role,
    };
  } else if (row.actor) {
    actor = { id: row.actor.toString(), name: null, email: null, role: null };
  }

  return {
    id: row._id.toString(),
    actor,
    action: row.action,
    entity: row.entity,
    entityId: row.entityId,
    before: row.before ?? null,
    after: row.after ?? null,
    timestamp: row.timestamp,
  };
}

export async function listAuditLogs(query) {
  const { page, limit, skip } = readPage(query);
  const filter = {};
  if (query.action) filter.action = query.action;
  if (query.entity) filter.entity = query.entity;
  if (query.entityId) filter.entityId = query.entityId;
  if (query.actor) filter.actor = query.actor;
  if (query.from || query.to) {
    filter.timestamp = {};
    if (query.from) filter.timestamp.$gte = new Date(query.from);
    if (query.to) filter.timestamp.$lte = new Date(query.to);
  }

  const [rows, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .populate('actor', 'name email role'),
    AuditLog.countDocuments(filter),
  ]);

  return pageData(rows.map(toAuditItem), total, page, limit);
}
