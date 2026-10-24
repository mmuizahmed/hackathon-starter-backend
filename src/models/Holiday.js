import mongoose from 'mongoose';

// tentative is for moon-sighting holidays. They still count as holidays until edited.
const holidaySchema = new mongoose.Schema(
  {
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    name: { type: String, required: true, trim: true },
    tentative: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'holidays' },
);

holidaySchema.index({ date: 1 });

export const Holiday = mongoose.model('Holiday', holidaySchema);
