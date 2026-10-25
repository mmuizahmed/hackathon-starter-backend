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

test('calendar leaves days outside employment unmarked', async () => {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  try {
    const { createCompany, createEmployee } = await import('./factory.js');
    const { monthCalendar, summarizeMonth } = await import('../src/services/attendance.service.js');
    const { department, designation, admin } = await createCompany();
    const actor = { id: String(admin._id), role: 'admin', employeeId: null };
    const today = '2026-10-31';

    const { employee } = await createEmployee({
      department,
      designation,
      name: 'Late Joiner',
      email: 'joiner@example.com',
      code: 'E-015',
      joinDate: '2026-10-15',
    });

    const calendar = await monthCalendar(
      actor,
      { employeeId: String(employee._id), month: '2026-10' },
      today,
    );
    const beforeJoin = calendar.days.filter((day) => day.date <= '2026-10-14');
    assert.equal(beforeJoin.length, 14);
    for (const day of beforeJoin) {
      assert.equal(day.status, null, day.date);
    }
    assert.equal(calendar.days.find((day) => day.date === '2026-10-15').status, 'absent');

    const counts = await summarizeMonth(employee._id, today);
    const markedAbsent = calendar.days.filter((day) => day.status === 'absent').length;
    assert.equal(counts.absent, markedAbsent);
    assert.equal(beforeJoin.some((day) => day.status === 'absent'), false);
    assert.ok(counts.absent > 0);

    const { employee: leaver } = await createEmployee({
      department,
      designation,
      name: 'Early Exit',
      email: 'leaver@example.com',
      code: 'E-020',
      joinDate: '2026-01-01',
      exitDate: '2026-10-20',
    });
    const exitCalendar = await monthCalendar(
      actor,
      { employeeId: String(leaver._id), month: '2026-10' },
      today,
    );
    const afterExit = exitCalendar.days.filter((day) => day.date >= '2026-10-21');
    assert.equal(afterExit.length, 11);
    for (const day of afterExit) {
      assert.equal(day.status, null, day.date);
    }
    assert.equal(exitCalendar.days.find((day) => day.date === '2026-10-20').status, 'absent');

    const exitCounts = await summarizeMonth(leaver._id, today);
    assert.equal(
      exitCounts.absent,
      exitCalendar.days.filter((day) => day.status === 'absent').length,
    );
    assert.equal(afterExit.some((day) => day.status === 'absent'), false);
  } finally {
    await mongoose.disconnect();
    await mongod.stop();
  }
});
