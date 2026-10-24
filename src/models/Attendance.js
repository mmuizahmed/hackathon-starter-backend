import mongoose from 'mongoose';

// date is the Karachi calendar day (YYYY-MM-DD), not a UTC instant.
// One row per employee per day. The server writes checkIn and checkOut.
// status is the payroll label. `late` is separate so a half day can still be a late arrival.
// absent and on_leave are usually calculated when no row exists; the enum allows storing them.
const attendanceSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    checkIn: { type: Date, default: null },
    checkOut: { type: Date, default: null },
    status: {
      type: String,
      required: true,
      enum: ['present', 'late', 'half_day', 'absent', 'missing_checkout', 'on_leave'],
    },
    late: { type: Boolean, default: false },
    source: { type: String, required: true, enum: ['web', 'camera', 'correction'] },
    location: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      accuracyMeters: { type: Number, default: null },
      distanceMeters: { type: Number, default: null },
      withinRadius: { type: Boolean, default: null },
    },
    faceCount: { type: Number, default: null },
    workedMinutes: { type: Number, default: null },
  },
  { timestamps: true, collection: 'attendance' },
);

attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1, status: 1 });

export const Attendance = mongoose.model('Attendance', attendanceSchema);
