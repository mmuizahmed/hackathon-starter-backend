import mongoose from 'mongoose';

// One row per AI call: chat, dashboard summary, smart leave, or policy question.
const aiLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, required: true, enum: ['admin', 'hr', 'employee'] },
    feature: {
      type: String,
      required: true,
      enum: ['chat', 'summary', 'smart_leave', 'policy'],
    },
    message: { type: String, default: '' },
    tools: { type: [String], default: [] },
    response: { type: String, default: '' },
    latencyMs: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['ok', 'error', 'timeout', 'refused'],
      default: 'ok',
    },
    error: { type: String, default: '' },
  },
  { timestamps: true, collection: 'aiLogs' },
);

aiLogSchema.index({ user: 1, createdAt: -1 });

export const AiLog = mongoose.model('AiLog', aiLogSchema);
