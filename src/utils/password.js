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
