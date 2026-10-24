import mongoose from 'mongoose';

// Names are unique across the company (one "Software Engineer" row).
const designationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'designations' },
);

export const Designation = mongoose.model('Designation', designationSchema);
