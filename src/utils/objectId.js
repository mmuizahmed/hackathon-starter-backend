import mongoose from 'mongoose';
import { AppError } from './AppError.js';

export function assertObjectId(value, label = 'id') {
  if (!mongoose.isValidObjectId(value)) {
    throw new AppError(`Invalid ${label}`, 400);
  }
  return value;
}
