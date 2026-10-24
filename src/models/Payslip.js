import mongoose from 'mongoose';

const BREAKDOWN_KEYS = ['inputs', 'earnings', 'deductions', 'tax', 'net', 'proration'];

// The breakdown stores every line and the numbers that produced it, including tax slabs.
// Top-level gross, deductions, tax, and net must match it so dashboards can sum them.
// Field list: docs/API.md (Payroll).
const payslipSchema = new mongoose.Schema(
  {
    payrollRun: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollRun', required: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    designation: { type: mongoose.Schema.Types.ObjectId, ref: 'Designation', default: null },
    breakdown: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      validate: {
        validator(value) {
          return Boolean(value) && BREAKDOWN_KEYS.every((key) => key in value);
        },
        message: 'breakdown must include inputs, earnings, deductions, tax, net, and proration',
      },
    },
    gross: { type: Number, required: true },
    deductions: { type: Number, required: true },
    tax: { type: Number, required: true },
    net: { type: Number, required: true },
  },
  { timestamps: true, collection: 'payslips' },
);

payslipSchema.index({ payrollRun: 1, employee: 1 }, { unique: true });
payslipSchema.index({ employee: 1, month: 1 });

export const Payslip = mongoose.model('Payslip', payslipSchema);
