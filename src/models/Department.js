import mongoose from 'mongoose';

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'departments' },
);

export const Department = mongoose.model('Department', departmentSchema);
