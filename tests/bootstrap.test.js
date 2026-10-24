import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-value';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.ADMIN_EMAIL = 'boss@example.com';
process.env.ADMIN_PASSWORD = 'boss-pass-1';
process.env.COMPANY_NAME = 'Saylani Test';
delete process.env.MONGODB_URI;

const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongoose = (await import('mongoose')).default;

test('ADMIN_EMAIL bootstraps one admin and then stops', { timeout: 180000 }, async () => {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  try {
    const { bootstrapFromEnv, isInitialized } = await import('../src/services/setup.service.js');
    const { User } = await import('../src/models/User.js');
    const { LeaveType } = await import('../src/models/LeaveType.js');

    assert.equal(await isInitialized(), false);
    assert.equal(await bootstrapFromEnv(), true);
    assert.equal(await isInitialized(), true);
    assert.equal(await bootstrapFromEnv(), false);

    const admin = await User.findOne({ email: 'boss@example.com' });
    assert.equal(admin.role, 'admin');
    assert.equal(admin.mustChangePassword, false);
    assert.equal(await User.countDocuments(), 1);
    assert.equal(await LeaveType.countDocuments(), 4);

    const settings = await mongoose.connection.collection('settings').findOne({});
    assert.equal(settings.companyName, 'Saylani Test');
    assert.equal(settings.officeStart, '09:00');
    assert.equal(settings.graceMinutes, 15);
  } finally {
    await mongoose.disconnect();
    await mongod.stop();
  }
});
