import mongoose from 'mongoose';

const dateString = /^\d{4}-\d{2}-\d{2}$/;

const leaveRequestSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    leaveType: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveType', required: true },
    startDate: { type: String, required: true, match: dateString },
    endDate: { type: String, required: true, match: dateString },
    days: { type: Number, required: true, min: 0 },
    reason: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
    },
    reviewComment: { type: String, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    // Set when the employee used smart leave. The request is still saved only after they confirm.
    smartLeaveText: { type: String, default: '' },
  },
  { timestamps: true, collection: 'leaveRequests' },
);

leaveRequestSchema.index({ employee: 1, status: 1 });
leaveRequestSchema.index({ startDate: 1, endDate: 1 });

export const LeaveRequest = mongoose.model('LeaveRequest', leaveRequestSchema);
