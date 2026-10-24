import { Notification } from '../models/Notification.js';
import { AppError } from '../utils/AppError.js';
import { isObjectId } from '../utils/ids.js';
import { pageData, readPage } from '../utils/page.js';

// Other modules call this. It stores the login id, not the employee id,
// because admin and HR notifications have no employee profile.
export async function notify({ userId, title, body = '', type = 'system', entity = '', entityId = '' }) {
  if (!userId) return null;
  const row = await Notification.create({
    user: userId,
    title,
    body,
    type,
    entity,
    entityId: entityId ? String(entityId) : '',
  });
  return toNotification(row);
}

function toNotification(row) {
  return {
    id: row._id.toString(),
    title: row.title,
    body: row.body || '',
    type: row.type,
    read: Boolean(row.read),
    entity: row.entity || '',
    entityId: row.entityId || '',
    createdAt: row.createdAt,
  };
}

export async function listNotifications(user, query) {
  const { page, limit, skip } = readPage(query);
  const filter = { user: user.id };
  const [rows, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: user.id, read: false }),
  ]);
  return { ...pageData(rows.map(toNotification), total, page, limit), unreadCount };
}

export async function unreadCount(user) {
  const count = await Notification.countDocuments({ user: user.id, read: false });
  return { count };
}

export async function markNotificationRead(user, id) {
  if (!isObjectId(id)) {
    throw new AppError('Notification not found', 404);
  }
  const row = await Notification.findOneAndUpdate(
    { _id: id, user: user.id },
    { read: true },
    { new: true },
  );
  if (!row) {
    throw new AppError('Notification not found', 404);
  }
  return toNotification(row);
}

export async function markAllNotificationsRead(user) {
  const result = await Notification.updateMany({ user: user.id, read: false }, { read: true });
  return { updated: result.modifiedCount || 0 };
}
