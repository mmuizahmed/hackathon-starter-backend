import { DEFAULT_LEAVE_TYPES } from '../constants/defaultLeaveTypes.js';
import { env } from '../config/env.js';
import { LeaveType } from '../models/LeaveType.js';
import { Settings } from '../models/Settings.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { hashPassword } from '../utils/password.js';
import { recordAudit } from './audit.service.js';

const SETTINGS_KEY = 'company';

export function settingsFromInput(companyName, settings = {}) {
  const weekend = settings.weekend ? [...new Set(settings.weekend)] : ['Sat', 'Sun'];
  return {
    key: SETTINGS_KEY,
    companyName,
    officeStart: settings.officeStart ?? '09:00',
    graceMinutes: settings.graceMinutes ?? 15,
    halfDayHours: settings.halfDayHours ?? 5,
    weekend,
    officeLat: settings.officeLat ?? null,
    officeLng: settings.officeLng ?? null,
    radiusMeters: settings.radiusMeters ?? 150,
    latePenalty: {
      enabled: false,
      latesPerHalfDay: 3,
    },
  };
}

export async function isInitialized() {
  const existing = await Settings.exists({ key: SETTINGS_KEY });
  return Boolean(existing);
}

function settingsSnapshot(settings) {
  return {
    companyName: settings.companyName,
    officeStart: settings.officeStart,
    graceMinutes: settings.graceMinutes,
    halfDayHours: settings.halfDayHours,
    weekend: settings.weekend,
    officeLat: settings.officeLat,
    officeLng: settings.officeLng,
    radiusMeters: settings.radiusMeters,
    latePenalty: settings.latePenalty,
  };
}

export async function completeSetup(input) {
  if (await isInitialized()) {
    throw new AppError('Setup has already been completed', 409);
  }

  // The unique key is the lock. A second request fails here instead of creating two admins.
  let settings;
  try {
    settings = await Settings.create(settingsFromInput(input.companyName, input.settings));
  } catch (error) {
    if (error.code === 11000) {
      throw new AppError('Setup has already been completed', 409);
    }
    throw error;
  }

  let user = null;
  try {
    await LeaveType.insertMany(DEFAULT_LEAVE_TYPES);
    const passwordHash = await hashPassword(input.adminPassword);
    user = await User.create({
      name: input.adminName,
      email: input.adminEmail,
      passwordHash,
      role: 'admin',
      active: true,
      mustChangePassword: false,
      employee: null,
    });

    await recordAudit({
      actorId: user._id,
      action: 'setup.complete',
      entity: 'Settings',
      entityId: settings._id,
      before: null,
      after: settingsSnapshot(settings),
    });
    await recordAudit({
      actorId: user._id,
      action: 'user.create',
      entity: 'User',
      entityId: user._id,
      before: null,
      after: { name: user.name, email: user.email, role: user.role },
    });
    return user;
  } catch (error) {
    await Settings.deleteOne({ _id: settings._id });
    await LeaveType.deleteMany({ code: { $in: DEFAULT_LEAVE_TYPES.map((row) => row.code) } });
    if (user) {
      await User.deleteOne({ _id: user._id });
    }
    if (error.code === 11000) {
      throw new AppError('Setup has already been completed', 409);
    }
    throw error;
  }
}

// Optional boot-time setup from env variables. The setup screen is the normal path.
export async function bootstrapFromEnv() {
  if (!env.adminEmail) {
    return false;
  }
  if (await isInitialized()) {
    console.log('Setup: already initialized. Skipped ADMIN_EMAIL bootstrap.');
    return false;
  }
  await completeSetup({
    companyName: env.companyName || 'HCM Lite',
    adminName: 'Administrator',
    adminEmail: env.adminEmail,
    adminPassword: env.adminPassword,
  });
  console.log(`Setup: created admin ${env.adminEmail} from environment variables.`);
  return true;
}
