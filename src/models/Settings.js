import mongoose from 'mongoose';
import { WEEKDAYS } from '../constants/weekdays.js';

// One company row. The key is always "company".
// Callers copy these rules onto new attendance, leave, and payroll records.
// Changing settings later does not rewrite old rows.
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'company' },
    companyName: { type: String, required: true, trim: true },
    officeStart: {
      type: String,
      required: true,
      default: '09:00',
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
    },
    graceMinutes: { type: Number, required: true, default: 15, min: 0 },
    halfDayHours: { type: Number, required: true, default: 5, min: 1 },
    weekend: {
      type: [{ type: String, enum: WEEKDAYS }],
      default: ['Sat', 'Sun'],
    },
    officeLat: {
      type: Number,
      default: null,
      validate: {
        validator(value) {
          return value == null || (value >= -90 && value <= 90);
        },
        message: 'officeLat must be between -90 and 90',
      },
    },
    officeLng: {
      type: Number,
      default: null,
      validate: {
        validator(value) {
          return value == null || (value >= -180 && value <= 180);
        },
        message: 'officeLng must be between -180 and 180',
      },
    },
    radiusMeters: { type: Number, default: 150, min: 1 },
    // Bonus rule. Off until an admin turns it on, so core payroll stays as the brief.
    latePenalty: {
      enabled: { type: Boolean, default: false },
      latesPerHalfDay: { type: Number, default: 3, min: 1 },
    },
  },
  { timestamps: true, collection: 'settings' },
);

export const Settings = mongoose.model('Settings', settingsSchema);
