import mongoose from 'mongoose';

const attendanceCorrectionSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    attendance: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendance', default: null },
    requestedCheckIn: { type: Date, default: null },
    requestedCheckOut: { type: Date, default: null },
    reason: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    reviewComment: { type: String, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'attendanceCorrections' },
);

attendanceCorrectionSchema.index({ employee: 1, status: 1 });

export const AttendanceCorrection = mongoose.model(
  'AttendanceCorrection',
  attendanceCorrectionSchema,
);
