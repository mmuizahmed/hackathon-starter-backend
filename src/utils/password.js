import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

// bcryptjs is the bcrypt algorithm in plain JavaScript (hash starts with $2).
// 10 rounds is the cost factor. We never store the plain password.
const ROUNDS = 10;

export function hashPassword(plain) {
  return bcrypt.hash(plain, ROUNDS);
}

export function checkPassword(plain, passwordHash) {
  return bcrypt.compare(plain, passwordHash);
}

export function makeTemporaryPassword() {
  // Hex is easy to read aloud. The result is longer than the 8 character minimum.
  return `Temp-${randomBytes(4).toString('hex')}`;
}
