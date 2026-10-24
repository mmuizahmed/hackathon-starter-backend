import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-value';
process.env.CLIENT_URL = 'http://localhost:5173';
delete process.env.MONGODB_URI;
delete process.env.ADMIN_EMAIL;
delete process.env.ADMIN_PASSWORD;
delete process.env.COMPANY_NAME;

test('holiday, half day, joiner, same-day salary, and exited staff', { timeout: 180000 }, async () => {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const mongoose = (await import('mongoose')).default;
  const { listen, request, stop } = await import('./http.js');
  const { createCompany, createEmployee, login } = await import('./factory.js');
  const { Attendance } = await import('../src/models/Attendance.js');
  const { Employee } = await import('../src/models/Employee.js');
  const { Holiday } = await import('../src/models/Holiday.js');
  const { listWorkingDays } = await import('../src/services/calendar.service.js');

  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const { default: app } = await import('../src/app.js');
  const started = await listen(app);
  const { base } = started;

  try {
    const { department, designation } = await createCompany();
    await Holiday.create({ date: '2026-10-01', name: 'Founders day', tentative: false });

    const monthDays = await listWorkingDays('2026-10-01', '2026-10-31');
    assert.equal(monthDays.includes('2026-10-01'), false);
    assert.equal(monthDays.length, 21);
    const aliDays = monthDays.filter((day) => day >= '2026-10-15');
    assert.equal(aliDays.length, 12);

    const eva = await createEmployee({
      department, designation, name: 'Eva', email: 'eva@example.com', code: 'E-001', joinDate: '2026-01-01',
    });
    const ali = await createEmployee({
      department, designation, name: 'Ali', email: 'ali@example.com', code: 'E-002', joinDate: '2026-10-15',
    });
    const noor = await createEmployee({
      department, designation, name: 'Noor', email: 'noor@example.com', code: 'E-003', joinDate: '2026-01-01',
    });
    await Employee.updateOne({ _id: noor.employee._id }, { $set: { status: 'exited', exitDate: null } });
    const sam = await createEmployee({
      department, designation, name: 'Sam', email: 'sam@example.com', code: 'E-004', joinDate: '2026-01-01',
    });

    const hrCookie = await login(base, 'hr@example.com', 'hr-pass-123');
    for (const person of [eva, ali, noor]) {
      const saved = await request(base, `/api/salary-structures/${person.employee._id}`, {
        method: 'PUT',
        cookie: hrCookie,
        body: { basic: 100000, effectiveFrom: '2026-01-01' },
      });
      assert.equal(saved.status, 200, JSON.stringify(saved.json));
    }

    const halfDay = monthDays[0];
    assert.equal(halfDay, '2026-10-02');
    await Attendance.create({
      employee: eva.employee._id,
      date: halfDay,
      status: 'half_day',
      late: false,
      source: 'web',
    });
    for (const date of monthDays.slice(1)) {
      await Attendance.create({
        employee: eva.employee._id,
        date,
        status: 'present',
        late: false,
        source: 'web',
      });
    }
    for (const date of aliDays) {
      await Attendance.create({
        employee: ali.employee._id,
        date,
        status: 'present',
        late: false,
        source: 'web',
      });
    }

    const draft = await request(base, '/api/payroll/runs', {
      method: 'POST',
      cookie: hrCookie,
      body: { month: '2026-10' },
    });
    assert.equal(draft.status, 201, JSON.stringify(draft.json));
    assert.equal(draft.json.data.workingDays, 21);
    assert.equal(draft.json.data.payslips.length, 2);

    const evaSlip = draft.json.data.payslips.find((row) => row.employeeCode === 'E-001');
    const aliSlip = draft.json.data.payslips.find((row) => row.employeeCode === 'E-002');
    assert.equal(evaSlip.breakdown.inputs.halfDays, 1);
    assert.equal(evaSlip.breakdown.inputs.absentDays, 0);
    assert.equal(evaSlip.breakdown.inputs.perDayRate, 7142.86);
    assert.equal(evaSlip.gross, 150000);
    assert.equal(evaSlip.deductions, 3571.43);
    assert.equal(evaSlip.tax, 10000);
    assert.equal(evaSlip.net, 136428.57);
    assert.equal(aliSlip.breakdown.inputs.employedWorkingDays, 12);
    assert.equal(aliSlip.breakdown.inputs.workingDays, 21);
    assert.equal(aliSlip.gross, 85714.32);
    assert.equal(aliSlip.tax, 5714.29);
    assert.equal(aliSlip.net, 80000.03);
    assert.equal(draft.json.data.payslips.some((row) => row.employeeCode === 'E-003'), false);

    const first = await request(base, `/api/salary-structures/${sam.employee._id}`, {
      method: 'PUT',
      cookie: hrCookie,
      body: { basic: 100000, effectiveFrom: '2026-01-31' },
    });
    assert.equal(first.status, 200, JSON.stringify(first.json));
    const corrected = await request(base, `/api/salary-structures/${sam.employee._id}`, {
      method: 'PUT',
      cookie: hrCookie,
      body: { basic: 80000, effectiveFrom: '2026-01-31' },
    });
    assert.equal(corrected.status, 200, JSON.stringify(corrected.json));
    assert.equal(corrected.json.data.gross, 120000);

    const history = await request(base, `/api/salary-structures?employeeId=${sam.employee._id}`, {
      cookie: hrCookie,
    });
    const closed = history.json.data.items.find((row) => row.active === false);
    assert.equal(closed.basic, 100000);
    assert.equal(closed.effectiveTo, '2026-01-30');

    const january = await request(base, '/api/payroll/runs', {
      method: 'POST',
      cookie: hrCookie,
      body: { month: '2026-01' },
    });
    assert.equal(january.status, 201, JSON.stringify(january.json));
    const samSlip = january.json.data.payslips.find((row) => row.employeeCode === 'E-004');
    assert.ok(samSlip);
    assert.equal(samSlip.breakdown.inputs.grossMonthly, 120000);
    assert.equal(samSlip.gross, 120000);
  } finally {
    await stop(started.server);
    await mongoose.disconnect();
    await mongod.stop();
  }
});
