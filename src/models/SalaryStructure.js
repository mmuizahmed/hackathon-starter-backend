import mongoose from 'mongoose';

// HR stores basic and the allowance amounts.
// The standard structure is hra = 40% of basic and medical = 10%, so gross = 1.5 × basic.
// Payroll uses the stored amounts. It does not assume the percentages if HR changed them.
const salaryStructureSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    basic: { type: Number, required: true, min: 1 },
    allowances: {
      hra: { type: Number, default: 0, min: 0 },
      medical: { type: Number, default: 0, min: 0 },
      other: { type: Number, default: 0, min: 0 },
    },
    effectiveFrom: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    effectiveTo: { type: String, default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'salaryStructures' },
);

// Older rows stay for history. Only one of them may be active.
salaryStructureSchema.index(
  { employee: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);

export const SalaryStructure = mongoose.model('SalaryStructure', salaryStructureSchema);
