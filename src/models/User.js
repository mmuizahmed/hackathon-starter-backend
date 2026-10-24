import mongoose from 'mongoose';

// passwordHash is select:false so a normal find() cannot leak it into JSON.
// employee is set for people who check in. Admin and HR logins usually have none.
// mustChangePassword is true when HR created a temporary password.
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, required: true, enum: ['admin', 'hr', 'employee'] },
    active: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: false },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
  },
  { timestamps: true, collection: 'users' },
);

export const User = mongoose.model('User', userSchema);
