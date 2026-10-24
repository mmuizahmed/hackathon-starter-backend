import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-value';
process.env.CLIENT_URL = 'http://localhost:5173';
delete process.env.MONGODB_URI;
delete process.env.ADMIN_EMAIL;
delete process.env.ADMIN_PASSWORD;
delete process.env.COMPANY_NAME;

const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongoose = (await import('mongoose')).default;
const { listen, request, stop } = await import('./http.js');

const setupBody = {
  companyName: 'Saylani',
  adminName: 'Ada Admin',
  adminEmail: 'ada@example.com',
  adminPassword: 'correct-horse',
  settings: {
    officeStart: '10:00',
    graceMinutes: 20,
    halfDayHours: 4,
    weekend: ['Fri'],
    officeLat: 25,
    officeLng: 67,
    radiusMeters: 120,
  },
};

test('setup, login, password gate, role guard, and audit', { timeout: 180000 }, async (t) => {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const { default: app } = await import('../src/app.js');
  const { Settings } = await import('../src/models/Settings.js');
  const { LeaveType } = await import('../src/models/LeaveType.js');
  const { User } = await import('../src/models/User.js');
  const { AuditLog } = await import('../src/models/AuditLog.js');
  const { hashPassword } = await import('../src/utils/password.js');
  const started = await listen(app);
  const { base } = started;

  try {
    await t.test('rejects an incomplete setup body', async () => {
      const { status, json } = await request(base, '/api/setup', {
        method: 'POST',
        body: { companyName: 'Saylani' },
      });
      assert.equal(status, 400);
      assert.equal(json.success, false);
      assert.equal(json.message, 'Validation failed');
      assert.ok(Array.isArray(json.errors));
    });

    await t.test('reports that setup has not run', async () => {
      const { status, json } = await request(base, '/api/setup/status');
      assert.equal(status, 200);
      assert.deepEqual(json, { success: true, data: { initialized: false } });
      assert.equal(await LeaveType.countDocuments(), 0);
    });

    await t.test('creates the company once and sets the cookie', async () => {
      const { status, json, tokenCookie, setCookie } = await request(base, '/api/setup', {
        method: 'POST',
        body: setupBody,
      });
      assert.equal(status, 201);
      assert.equal(json.success, true);
      assert.equal(json.data.user.email, 'ada@example.com');
      assert.equal(json.data.user.role, 'admin');
      assert.equal(json.data.user.mustChangePassword, false);
      assert.equal(json.data.user.employeeId, null);
      assert.equal(JSON.stringify(json).includes('passwordHash'), false);
      assert.match(tokenCookie, /^token=/);
      assert.match(setCookie[0], /HttpOnly/i);
      assert.match(setCookie[0], /SameSite=Lax/i);

      const settings = await Settings.findOne({ key: 'company' }).lean();
      assert.equal(settings.officeStart, '10:00');
      assert.equal(settings.graceMinutes, 20);
      assert.equal(settings.halfDayHours, 4);
      assert.deepEqual(settings.weekend, ['Fri']);
      assert.equal(settings.officeLat, 25);
      assert.equal(settings.officeLng, 67);
      assert.equal(settings.radiusMeters, 120);
      assert.equal(settings.latePenalty.enabled, false);
      assert.equal(settings.latePenalty.latesPerHalfDay, 3);

      const types = await LeaveType.find().sort({ code: 1 }).lean();
      assert.deepEqual(
        types.map((row) => ({ code: row.code, yearlyQuota: row.yearlyQuota, paid: row.paid })),
        [
          { code: 'ANNUAL', yearlyQuota: 14, paid: true },
          { code: 'CASUAL', yearlyQuota: 10, paid: true },
          { code: 'SICK', yearlyQuota: 8, paid: true },
          { code: 'UNPAID', yearlyQuota: null, paid: false },
        ],
      );

      const me = await request(base, '/api/auth/me', { cookie: tokenCookie });
      assert.equal(me.status, 200);
      assert.equal(me.json.data.user.name, 'Ada Admin');
    });

    await t.test('refuses a second setup', async () => {
      const { status, json } = await request(base, '/api/setup', {
        method: 'POST',
        body: setupBody,
      });
      assert.equal(status, 409);
      assert.equal(json.message, 'Setup has already been completed');
      const again = await request(base, '/api/setup/status');
      assert.equal(again.json.data.initialized, true);
      assert.equal(await User.countDocuments({ role: 'admin' }), 1);
    });

    await t.test('logs in and logs out', async () => {
      const bad = await request(base, '/api/auth/login', {
        method: 'POST',
        body: { email: 'ada@example.com', password: 'wrong-password' },
      });
      assert.equal(bad.status, 401);
      assert.equal(bad.json.message, 'Invalid email or password');
      assert.equal(bad.tokenCookie, '');

      const loggedIn = await request(base, '/api/auth/login', {
        method: 'POST',
        body: { email: 'Ada@Example.com', password: 'correct-horse' },
      });
      assert.equal(loggedIn.status, 200);
      assert.equal(loggedIn.json.data.user.role, 'admin');

      const gone = await request(base, '/api/auth/logout', {
        method: 'POST',
        cookie: loggedIn.tokenCookie,
      });
      assert.equal(gone.status, 200);
      assert.equal(gone.json.data.loggedOut, true);
      // The browser applies Set-Cookie and drops the token. The JWT itself is not stored server-side.
      assert.match(gone.setCookie.join(' '), /token=/);

      const me = await request(base, '/api/auth/me', { cookie: 'token=' });
      assert.equal(me.status, 401);
    });

    await t.test('blocks a temporary password, then allows a role check', async () => {
      const employeeId = new mongoose.Types.ObjectId();
      await User.create({
        name: 'Eva Employee',
        email: 'eva@example.com',
        passwordHash: await hashPassword('temp-pass-1'),
        role: 'employee',
        active: true,
        mustChangePassword: true,
        employee: employeeId,
      });

      const loggedIn = await request(base, '/api/auth/login', {
        method: 'POST',
        body: { email: 'eva@example.com', password: 'temp-pass-1' },
      });
      assert.equal(loggedIn.status, 200);
      assert.equal(loggedIn.json.data.user.mustChangePassword, true);
      assert.equal(loggedIn.json.data.user.employeeId, employeeId.toString());

      const blocked = await request(base, '/api/audit', { cookie: loggedIn.tokenCookie });
      assert.equal(blocked.status, 403);
      assert.equal(blocked.json.message, 'Password change required');

      const me = await request(base, '/api/auth/me', { cookie: loggedIn.tokenCookie });
      assert.equal(me.status, 200);

      const changed = await request(base, '/api/auth/change-password', {
        method: 'POST',
        cookie: loggedIn.tokenCookie,
        body: { currentPassword: 'temp-pass-1', newPassword: 'new-pass-123' },
      });
      assert.equal(changed.status, 200);
      assert.equal(changed.json.data.user.mustChangePassword, false);

      const roleBlocked = await request(base, '/api/audit', { cookie: loggedIn.tokenCookie });
      assert.equal(roleBlocked.status, 403);
      assert.equal(roleBlocked.json.message, 'You do not have access to this resource');
    });

    await t.test('hides the audit log from HR and shows it to admin', async () => {
      await User.create({
        name: 'Hassan HR',
        email: 'hr@example.com',
        passwordHash: await hashPassword('hr-pass-123'),
        role: 'hr',
        active: true,
        mustChangePassword: false,
      });
      const hr = await request(base, '/api/auth/login', {
        method: 'POST',
        body: { email: 'hr@example.com', password: 'hr-pass-123' },
      });
      const hrAudit = await request(base, '/api/audit', { cookie: hr.tokenCookie });
      assert.equal(hrAudit.status, 403);

      const admin = await request(base, '/api/auth/login', {
        method: 'POST',
        body: { email: 'ada@example.com', password: 'correct-horse' },
      });
      const audit = await request(base, '/api/audit?entity=Settings', { cookie: admin.tokenCookie });
      assert.equal(audit.status, 200);
      assert.equal(audit.json.data.page, 1);
      assert.ok(audit.json.data.total >= 1);
      assert.equal(audit.json.data.items[0].action, 'setup.complete');
      assert.equal(audit.json.data.items[0].entity, 'Settings');
      assert.equal(audit.json.data.items[0].actor.email, 'ada@example.com');
      assert.equal(JSON.stringify(audit.json).includes('passwordHash'), false);

      await assert.rejects(() => AuditLog.updateOne({}, { $set: { action: 'tamper' } }));
    });

    await t.test('rejects a deactivated login', async () => {
      await User.create({
        name: 'Old HR',
        email: 'old@example.com',
        passwordHash: await hashPassword('old-pass-123'),
        role: 'hr',
        active: false,
        mustChangePassword: false,
      });
      const { status, json, tokenCookie } = await request(base, '/api/auth/login', {
        method: 'POST',
        body: { email: 'old@example.com', password: 'old-pass-123' },
      });
      assert.equal(status, 403);
      assert.equal(json.message, 'Account is deactivated');
      assert.equal(tokenCookie, '');
    });
  } finally {
    await stop(started.server);
    await mongoose.disconnect();
    await mongod.stop();
  }
});
