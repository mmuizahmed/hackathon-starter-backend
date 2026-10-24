import mongoose from 'mongoose';

// `user` is the login id, not the employee id. Each person only reads their own rows.
const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, default: '' },
    type: {
      type: String,
      enum: ['leave', 'payslip', 'announcement', 'attendance', 'system'],
      default: 'system',
    },
    read: { type: Boolean, default: false },
    entity: { type: String, default: '' },
    entityId: { type: String, default: '' },
  },
  { timestamps: true, collection: 'notifications' },
);

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);
