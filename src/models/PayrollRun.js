import mongoose from 'mongoose';

// One run per month. A finalized run is locked; nothing in the API may edit it after that.
const payrollRunSchema = new mongoose.Schema(
  {
    month: { type: String, required: true, unique: true, match: /^\d{4}-\d{2}$/ },
    status: { type: String, enum: ['draft', 'finalized'], default: 'draft' },
    workingDays: { type: Number, default: 0, min: 0 },
    totals: {
      employees: { type: Number, default: 0 },
      gross: { type: Number, default: 0 },
      deductions: { type: Number, default: 0 },
      tax: { type: Number, default: 0 },
      net: { type: Number, default: 0 },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    finalizedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'payrollRuns' },
);

export const PayrollRun = mongoose.model('PayrollRun', payrollRunSchema);
