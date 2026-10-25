import mongoose from 'mongoose';

const dateString = /^\d{4}-\d{2}-\d{2}$/;

const employeeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    phone: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    designation: { type: mongoose.Schema.Types.ObjectId, ref: 'Designation', required: true },
    joinDate: { type: String, required: true, match: dateString },
    exitDate: {
      type: String,
      default: null,
      validate: {
        validator(value) {
          return value == null || dateString.test(value);
        },
        message: 'exitDate must be YYYY-MM-DD',
      },
    },
    status: {
      type: String,
      enum: ['active', 'probation', 'exited'],
      default: 'active',
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other', 'undisclosed'],
      default: 'undisclosed',
    },
    // A salary must be greater than zero.
    salary: {
      basic: { type: Number, required: true, min: 1 },
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Numeric face embedding from the browser. Never a photo.
    // select:false keeps it out of list, detail, and assistant queries.
    faceDescriptor: { type: [Number], select: false },
    faceModel: { type: String, default: null, trim: true },
    faceEnrolledAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'employees' },
);

employeeSchema.index({ department: 1, status: 1 });

export const Employee = mongoose.model('Employee', employeeSchema);
