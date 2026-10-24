import mongoose from 'mongoose';

// yearlyQuota null means unlimited (unpaid leave).
// The four defaults are inserted by setup.service.js when setup finishes.
const leaveTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    code: { type: String, required: true, trim: true, uppercase: true, unique: true },
    yearlyQuota: { type: Number, default: null, min: 0 },
    paid: { type: Boolean, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'leaveTypes' },
);

export const LeaveType = mongoose.model('LeaveType', leaveTypeSchema);
