import mongoose from 'mongoose';

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    audience: {
      type: String,
      enum: ['all', 'admin', 'hr', 'employee'],
      default: 'all',
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'announcements' },
);

export const Announcement = mongoose.model('Announcement', announcementSchema);
