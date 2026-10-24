import { Settings } from '../models/Settings.js';
import { AppError } from '../utils/AppError.js';
import { recordAudit } from './audit.service.js';

const SETTINGS_KEY = 'company';

export function toSettings(doc) {
  return {
    id: doc._id.toString(),
    companyName: doc.companyName,
    officeStart: doc.officeStart,
    graceMinutes: doc.graceMinutes,
    halfDayHours: doc.halfDayHours,
    weekend: doc.weekend,
    officeLat: doc.officeLat ?? null,
    officeLng: doc.officeLng ?? null,
    radiusMeters: doc.radiusMeters,
    latePenalty: {
      enabled: Boolean(doc.latePenalty?.enabled),
      latesPerHalfDay: doc.latePenalty?.latesPerHalfDay ?? 3,
    },
  };
}

export async function getSettings() {
  const settings = await Settings.findOne({ key: SETTINGS_KEY });
  if (!settings) {
    throw new AppError('Company setup is not complete', 404);
  }
  return settings;
}

export async function readSettings() {
  return toSettings(await getSettings());
}

// Writes the company rules. Existing attendance rows keep the status they already have.
export async function updateSettings(actor, input) {
  const hasLat = input.officeLat !== undefined;
  const hasLng = input.officeLng !== undefined;
  if (hasLat !== hasLng) {
    throw new AppError('officeLat and officeLng must be sent together', 400);
  }

  const settings = await getSettings();
  const before = toSettings(settings);
  const fields = [
    'companyName',
    'officeStart',
    'graceMinutes',
    'halfDayHours',
    'weekend',
    'officeLat',
    'officeLng',
    'radiusMeters',
  ];
  for (const field of fields) {
    if (input[field] !== undefined) settings[field] = input[field];
  }
  if (input.latePenalty) {
    if (input.latePenalty.enabled !== undefined) {
      settings.latePenalty.enabled = input.latePenalty.enabled;
    }
    if (input.latePenalty.latesPerHalfDay !== undefined) {
      settings.latePenalty.latesPerHalfDay = input.latePenalty.latesPerHalfDay;
    }
  }
  if (input.weekend) {
    settings.weekend = [...new Set(input.weekend)];
  }
  await settings.save();
  const after = toSettings(settings);
  await recordAudit({
    actorId: actor.id,
    action: 'settings.update',
    entity: 'Settings',
    entityId: settings._id,
    before,
    after,
  });
  return after;
}
