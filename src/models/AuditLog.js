import mongoose from 'mongoose';

// Append-only. There is no update or delete route.
// before/after are plain JSON. Never put a password hash in them.
const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    action: { type: String, required: true, trim: true },
    entity: { type: String, required: true, trim: true },
    entityId: { type: String, default: '' },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    timestamp: { type: Date, required: true, default: Date.now },
  },
  { collection: 'auditLogs' },
);

auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ entity: 1, action: 1 });

function blockChange() {
  throw new Error('Audit logs are append-only');
}

auditLogSchema.pre('save', function blockResave() {
  if (!this.isNew) {
    blockChange();
  }
});
auditLogSchema.pre('updateOne', blockChange);
auditLogSchema.pre('updateMany', blockChange);
auditLogSchema.pre('findOneAndUpdate', blockChange);
auditLogSchema.pre('replaceOne', blockChange);
auditLogSchema.pre('deleteOne', blockChange);
auditLogSchema.pre('deleteMany', blockChange);
auditLogSchema.pre('findOneAndDelete', blockChange);

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
