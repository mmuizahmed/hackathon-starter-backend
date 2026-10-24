import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-value';
process.env.CLIENT_URL = 'http://localhost:5173';
delete process.env.MONGODB_URI;
delete process.env.ADMIN_EMAIL;
delete process.env.ADMIN_PASSWORD;
delete process.env.COMPANY_NAME;

test('salary history, payroll draft, checks, finalize, and payslip scope', { timeout: 180000 }, async () => {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const mongoose = (await import('mongoose')).default;
  const { listen, request, requestRaw, stop } = await import('./http.js');
  const { createCompany, createEmployee, login } = await import('./factory.js');
  const { Attendance } = await import('../src/models/Attendance.js');
  const { AttendanceCorrection } = await import('../src/models/AttendanceCorrection.js');
  const { LeaveRequest } = await import('../src/models/LeaveRequest.js');
  const { LeaveType } = await import('../src/models/LeaveType.js');
  const { Settings } = await import('../src/models/Settings.js');
  const { listWorkingDays } = await import('../src/services/calendar.service.js');

  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const { default: app } = await import('../src/app.js');
  const started = await listen(app);
  const { base } = started;

  try {
    const { department, designation } = await createCompany();
    await Settings.updateOne({ key: 'company' }, { $set: { 'latePenalty.enabled': true, 'latePenalty.latesPerHalfDay': 3 } });

    const eva = await createEmployee({
      department, designation, name: 'Eva', email: 'eva@example.com', code: 'E-001', joinDate: '2026-01-01',
    });
    const ali = await createEmployee({
      department, designation, name: 'Ali', email: 'ali@example.com', code: 'E-002', joinDate: '2026-10-15',
    });
    const noPay = await createEmployee({
      department, designation, name: 'Noor', email: 'noor@example.com', code: 'E-003', joinDate: '2026-01-01',
    });

    const hrCookie = await login(base, 'hr@example.com', 'hr-pass-123');
    const adminCookie = await login(base, 'ada@example.com', 'correct-horse');
    const evaCookie = await login(base, 'eva@example.com', 'eva-pass-123');
    const aliCookie = await login(base, 'ali@example.com', 'eva-pass-123');

    const salary = await request(base, `/api/salary-structures/${eva.employee._id}`, {
      method: 'PUT',
      cookie: hrCookie,
      body: { basic: 100000, effectiveFrom: '2026-01-01' },
    });
    assert.equal(salary.status, 200, JSON.stringify(salary.json));
    assert.equal(salary.json.data.allowances.hra, 40000);
    assert.equal(salary.json.data.allowances.medical, 10000);
    assert.equal(salary.json.data.gross, 150000);

    const aliSalary = await request(base, `/api/salary-structures/${ali.employee._id}`, {
      method: 'PUT',
      cookie: hrCookie,
      body: { basic: 100000, effectiveFrom: '2026-01-01' },
    });
    assert.equal(aliSalary.status, 200, JSON.stringify(aliSalary.json));

    const employeeBlocked = await request(base, '/api/salary-structures', { cookie: evaCookie });
    assert.equal(employeeBlocked.status, 403);
    const adminWrite = await request(base, `/api/salary-structures/${eva.employee._id}`, {
      method: 'PUT',
      cookie: adminCookie,
      body: { basic: 100000, effectiveFrom: '2026-01-01' },
    });
    assert.equal(adminWrite.status, 403);

    const monthDays = await listWorkingDays('2026-10-01', '2026-10-31');
    assert.equal(monthDays.length, 22);
    const aliDays = monthDays.filter((day) => day >= '2026-10-15');
    assert.equal(aliDays.length, 12);

    const unpaidType = await LeaveType.findOne({ code: 'UNPAID' });
    const absentDay = monthDays[0];
    const halfDay = monthDays[1];
    const unpaidDay = monthDays[2];
    const lateDays = monthDays.slice(3, 6);
    const presentDays = monthDays.slice(6);

    await LeaveRequest.create({
      employee: eva.employee._id,
      leaveType: unpaidType._id,
      startDate: unpaidDay,
      endDate: unpaidDay,
      days: 1,
      reason: 'Unpaid',
      status: 'approved',
    });
    await Attendance.create({
      employee: eva.employee._id,
      date: halfDay,
      status: 'half_day',
      late: false,
      source: 'web',
    });
    for (const date of lateDays) {
      await Attendance.create({
        employee: eva.employee._id,
        date,
        status: 'late',
        late: true,
        source: 'web',
      });
    }
    for (const date of presentDays) {
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
    await Attendance.create({
      employee: eva.employee._id,
      date: absentDay,
      status: 'missing_checkout',
      late: false,
      source: 'web',
      checkIn: new Date('2026-10-01T04:00:00.000Z'),
      checkOut: null,
    });
    // The absent day above was overwritten if absentDay is also a created row.
    // monthDays[0] is the absent day and must have no payable record, so remove it
    // and keep a missing checkout on a present day instead.
    await Attendance.deleteOne({ employee: eva.employee._id, date: absentDay });
    const checkoutDay = presentDays[0];
    await Attendance.updateOne(
      { employee: eva.employee._id, date: checkoutDay },
      { status: 'missing_checkout', checkIn: new Date(`${checkoutDay}T04:00:00.000Z`), checkOut: null },
    );

    const pendingType = await LeaveType.findOne({ code: 'CASUAL' });
    await LeaveRequest.create({
      employee: eva.employee._id,
      leaveType: pendingType._id,
      startDate: '2026-11-02',
      endDate: '2026-11-03',
      days: 2,
      reason: 'November',
      status: 'pending',
    });
    await LeaveRequest.create({
      employee: eva.employee._id,
      leaveType: pendingType._id,
      startDate: '2026-10-26',
      endDate: '2026-10-26',
      days: 1,
      reason: 'October pending',
      status: 'pending',
    });
    await AttendanceCorrection.create({
      employee: eva.employee._id,
      date: '2026-10-08',
      reason: 'Forgot',
      status: 'pending',
    });

    const draft = await request(base, '/api/payroll/runs', {
      method: 'POST',
      cookie: hrCookie,
      body: { month: '2026-10' },
    });
    assert.equal(draft.status, 201, JSON.stringify(draft.json));
    assert.equal(draft.json.data.status, 'draft');
    assert.equal(draft.json.data.workingDays, 22);
    assert.equal(draft.json.data.payslips.length, 2);

    const evaSlip = draft.json.data.payslips.find((row) => row.employeeCode === 'E-001');
    const aliSlip = draft.json.data.payslips.find((row) => row.employeeCode === 'E-002');
    assert.equal(evaSlip.breakdown.inputs.absentDays, 1);
    assert.equal(evaSlip.breakdown.inputs.unpaidLeaveDays, 1);
    assert.equal(evaSlip.breakdown.inputs.halfDays, 1);
    assert.equal(evaSlip.breakdown.inputs.latePenaltyHalfDays, 1);
    assert.equal(evaSlip.breakdown.inputs.missingCheckoutDays, 1);
    assert.equal(evaSlip.deductions, 20454.54);
    assert.equal(evaSlip.tax, 10000);
    assert.equal(evaSlip.net, 119545.46);
    assert.equal(aliSlip.breakdown.inputs.employedWorkingDays, 12);
    assert.equal(aliSlip.breakdown.inputs.workingDays, 22);
    assert.equal(aliSlip.gross, 81818.16);
    assert.equal(aliSlip.tax, 5454.55);
    assert.equal(aliSlip.net, 76363.61);

    const raised = await request(base, `/api/salary-structures/${eva.employee._id}`, {
      method: 'PUT',
      cookie: hrCookie,
      body: { basic: 200000, effectiveFrom: '2026-11-01' },
    });
    assert.equal(raised.status, 200, JSON.stringify(raised.json));
    const history = await request(base, `/api/salary-structures?employeeId=${eva.employee._id}`, { cookie: adminCookie });
    assert.equal(history.json.data.total, 2);
    assert.equal(history.json.data.items.filter((row) => row.active).length, 1);

    const again = await request(base, '/api/payroll/runs', {
      method: 'POST',
      cookie: hrCookie,
      body: { month: '2026-10' },
    });
    assert.equal(again.status, 200, JSON.stringify(again.json));
    const evaAgain = again.json.data.payslips.find((row) => row.employeeCode === 'E-001');
    assert.equal(evaAgain.breakdown.inputs.grossMonthly, 150000);

    const checks = await request(base, `/api/payroll/runs/${again.json.data.id}/checks`, { cookie: hrCookie });
    assert.equal(checks.status, 200);
    assert.equal(checks.json.data.ok, false);
    assert.equal(checks.json.data.missingSalary.length, 1);
    assert.equal(checks.json.data.missingSalary[0].code, 'E-003');
    assert.equal(checks.json.data.missingCheckouts.length, 1);
    assert.equal(checks.json.data.pendingLeave.length, 1);
    assert.equal(checks.json.data.pendingLeave[0].startDate, '2026-10-26');
    assert.equal(checks.json.data.pendingCorrections.length, 1);

    const hrFinalize = await request(base, `/api/payroll/runs/${again.json.data.id}/finalize`, {
      method: 'POST',
      cookie: hrCookie,
      body: {},
    });
    assert.equal(hrFinalize.status, 403);

    const blocked = await request(base, `/api/payroll/runs/${again.json.data.id}/finalize`, {
      method: 'POST',
      cookie: adminCookie,
      body: {},
    });
    assert.equal(blocked.status, 422);
    assert.match(blocked.json.message, /Payroll checks failed/);

    const missingReason = await request(base, `/api/payroll/runs/${again.json.data.id}/finalize`, {
      method: 'POST',
      cookie: adminCookie,
      body: { override: true },
    });
    assert.equal(missingReason.status, 400);

    const finalized = await request(base, `/api/payroll/runs/${again.json.data.id}/finalize`, {
      method: 'POST',
      cookie: adminCookie,
      body: { override: true, reason: 'Judges are waiting and HR will fix Noor tomorrow' },
    });
    assert.equal(finalized.status, 200, JSON.stringify(finalized.json));
    assert.equal(finalized.json.data.status, 'finalized');

    const locked = await request(base, '/api/payroll/runs', {
      method: 'POST',
      cookie: hrCookie,
      body: { month: '2026-10' },
    });
    assert.equal(locked.status, 409);
    assert.match(locked.json.message, /finalized/);

    const audit = await request(base, '/api/audit?action=payroll.finalize', { cookie: adminCookie });
    assert.equal(audit.json.data.items[0].after.override, true);
    assert.match(audit.json.data.items[0].after.reason, /Noor/);

    const evaNotes = await request(base, '/api/notifications', { cookie: evaCookie });
    assert.ok(evaNotes.json.data.items.some((item) => item.type === 'payslip'));
    const noorCookie = await login(base, 'noor@example.com', 'eva-pass-123');
    const noorNotes = await request(base, '/api/notifications/unread-count', { cookie: noorCookie });
    assert.equal(noorNotes.json.data.count, 0);

    const finalEva = finalized.json.data.payslips.find((row) => row.employeeCode === 'E-001');
    const finalAli = finalized.json.data.payslips.find((row) => row.employeeCode === 'E-002');
    const pdf = await requestRaw(base, `/api/payslips/${finalEva.id}/pdf`, { cookie: evaCookie });
    assert.equal(pdf.status, 200);
    assert.match(pdf.contentType, /application\/pdf/);
    assert.equal(pdf.buffer.subarray(0, 4).toString(), '%PDF');
    // PDFKit writes WinAnsi text as hex, sometimes split for kerning.
    const text = [...pdf.buffer.toString('latin1').matchAll(/<([0-9A-Fa-f]+)>/g)]
      .map((match) => Buffer.from(match[1], 'hex').toString('latin1'))
      .join('');
    assert.match(text, /Saylani/);
    assert.match(text, /Eva/);
    assert.match(text, /Net pay/);
    assert.match(text, /Absent deduction/);
    assert.match(text, /30000 \+ 0\.15/);

    const stolen = await requestRaw(base, `/api/payslips/${finalAli.id}/pdf`, { cookie: evaCookie });
    assert.equal(stolen.status, 403);
    const stolenJson = await request(base, `/api/payslips/${finalAli.id}`, { cookie: evaCookie });
    assert.equal(stolenJson.status, 403);

    const ownList = await request(base, '/api/payslips', { cookie: evaCookie });
    assert.equal(ownList.json.data.total, 1);
    assert.equal(ownList.json.data.items[0].employeeCode, 'E-001');
    assert.equal(noPay.employee.code, 'E-003');
    assert.equal(await Settings.countDocuments({ key: 'company' }), 1);
  } finally {
    await stop(started.server);
    await mongoose.disconnect();
    await mongod.stop();
  }
});
