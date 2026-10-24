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

async function login(base, email, password) {
  const result = await request(base, '/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  assert.equal(result.status, 200, JSON.stringify(result.json));
  return result.tokenCookie;
}

async function changePassword(base, cookie, currentPassword, newPassword) {
  const result = await request(base, '/api/auth/change-password', {
    method: 'POST',
    cookie,
    body: { currentPassword, newPassword },
  });
  assert.equal(result.status, 200, JSON.stringify(result.json));
}

test('org, employees, and attendance', { timeout: 180000 }, async (t) => {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const { default: app } = await import('../src/app.js');
  const { countWorkingDays, isWorkingDay, listWorkingDays } = await import('../src/services/calendar.service.js');
  const { checkIn, checkOut, dailyBoard } = await import('../src/services/attendance.service.js');
  const { summarizeEmployeeAttendance } = await import('../src/services/attendanceSummary.service.js');
  const { Attendance } = await import('../src/models/Attendance.js');
  const { Holiday } = await import('../src/models/Holiday.js');
  const { Employee } = await import('../src/models/Employee.js');
  const { LeaveRequest } = await import('../src/models/LeaveRequest.js');
  const { LeaveType } = await import('../src/models/LeaveType.js');
  const { karachiWallTimeToUtc } = await import('../src/utils/timezone.js');
  const started = await listen(app);
  const { base } = started;

  const state = {};

  try {
    await t.test('working days skip the weekend and a tentative holiday', async () => {
      const setup = await request(base, '/api/setup', {
        method: 'POST',
        body: {
          companyName: 'Saylani',
          adminName: 'Ada Admin',
          adminEmail: 'ada@example.com',
          adminPassword: 'correct-horse',
          settings: { officeLat: 24.86, officeLng: 67.01, radiusMeters: 150 },
        },
      });
      assert.equal(setup.status, 201, JSON.stringify(setup.json));
      state.admin = setup.tokenCookie;

      const holiday = await request(base, '/api/holidays', {
        method: 'POST',
        cookie: state.admin,
        body: { date: '2026-10-26', name: 'Eid', tentative: true },
      });
      assert.equal(holiday.status, 201, JSON.stringify(holiday.json));

      assert.equal(await isWorkingDay('2026-10-24'), false);
      assert.equal(await isWorkingDay('2026-10-26'), false);
      assert.equal(await isWorkingDay('2026-10-27'), true);
      assert.equal(await countWorkingDays('2026-10-24', '2026-10-27'), 1);
      assert.deepEqual(await listWorkingDays('2026-10-24', '2026-10-27'), ['2026-10-27']);
    });

    await t.test('HR can view settings but cannot change them', async () => {
      const dept = await request(base, '/api/departments', {
        method: 'POST',
        cookie: state.admin,
        body: { name: 'Engineering' },
      });
      const role = await request(base, '/api/designations', {
        method: 'POST',
        cookie: state.admin,
        body: { name: 'Engineer' },
      });
      assert.equal(dept.status, 201);
      assert.equal(role.status, 201);
      state.departmentId = dept.json.data.id;
      state.designationId = role.json.data.id;

      const created = await request(base, '/api/users', {
        method: 'POST',
        cookie: state.admin,
        body: { name: 'Hassan HR', email: 'hr@example.com', password: 'hr-pass-123', role: 'admin' },
      });
      assert.equal(created.status, 400);

      const hr = await request(base, '/api/users', {
        method: 'POST',
        cookie: state.admin,
        body: { name: 'Hassan HR', email: 'hr@example.com', password: 'hr-pass-123' },
      });
      assert.equal(hr.status, 201, JSON.stringify(hr.json));
      assert.equal(hr.json.data.user.role, 'hr');
      assert.equal(hr.json.data.user.mustChangePassword, true);
      assert.equal(hr.json.data.temporaryPassword, 'hr-pass-123');

      const first = await login(base, 'hr@example.com', 'hr-pass-123');
      await changePassword(base, first, 'hr-pass-123', 'hr-pass-456');
      state.hr = await login(base, 'hr@example.com', 'hr-pass-456');

      const view = await request(base, '/api/settings', { cookie: state.hr });
      assert.equal(view.status, 200);
      assert.equal(view.json.data.officeStart, '09:00');
      assert.equal(view.json.data.graceMinutes, 15);

      const denied = await request(base, '/api/settings', {
        method: 'PUT',
        cookie: state.hr,
        body: { graceMinutes: 0 },
      });
      assert.equal(denied.status, 403);
      assert.equal(denied.json.message, 'You do not have access to this resource');
    });

    await t.test('CSV dry run reports row errors and does not write', async () => {
      const before = await Employee.countDocuments();
      const csv = [
        'code,name,email,phone,address,department,designation,joinDate,status,gender,basicSalary',
        ',No Name,not-an-email,,,Nope,Nope,24-10-2026,active,female,0',
        'E-200,Valid Person,valid.person@example.com,0300,Street,Engineering,Engineer,2026-10-01,active,female,80000',
      ].join('\n');
      const dry = await request(base, '/api/employees/import?dryRun=true', {
        method: 'POST',
        cookie: state.hr,
        body: { csv },
      });
      assert.equal(dry.status, 200, JSON.stringify(dry.json));
      assert.equal(dry.json.data.ok, false);
      assert.equal(dry.json.data.validRows, 1);
      assert.equal(await Employee.countDocuments(), before);
      const fields = dry.json.data.errors.map((error) => error.field);
      assert.ok(fields.includes('code'));
      assert.ok(fields.includes('email'));
      assert.ok(fields.includes('department'));
      assert.ok(fields.includes('joinDate'));
      assert.ok(fields.includes('basicSalary'));
      assert.ok(dry.json.data.errors.every((error) => error.row === 2));

      const commit = await request(base, '/api/employees/import?dryRun=false', {
        method: 'POST',
        cookie: state.hr,
        body: {
          csv: [
            'code,name,email,phone,address,department,designation,joinDate,status,gender,basicSalary',
            'E-200,Valid Person,valid.person@example.com,0300,Street,Engineering,Engineer,2026-10-01,active,female,80000',
          ].join('\n'),
        },
      });
      assert.equal(commit.status, 200, JSON.stringify(commit.json));
      assert.equal(commit.json.data.created, 1);
      assert.equal(commit.json.data.temporaryPasswords.length, 1);
      assert.equal(await Employee.countDocuments(), before + 1);
    });

    await t.test('an employee only sees their own record', async () => {
      const eva = await request(base, '/api/employees', {
        method: 'POST',
        cookie: state.hr,
        body: {
          code: 'E-001',
          name: 'Eva Employee',
          email: 'eva@example.com',
          departmentId: state.departmentId,
          designationId: state.designationId,
          joinDate: '2019-01-01',
          basicSalary: 100000,
        },
      });
      const omar = await request(base, '/api/employees', {
        method: 'POST',
        cookie: state.hr,
        body: {
          code: 'E-002',
          name: 'Omar Employee',
          email: 'omar@example.com',
          departmentId: state.departmentId,
          designationId: state.designationId,
          joinDate: '2019-01-01',
          basicSalary: 90000,
        },
      });
      assert.equal(eva.status, 201, JSON.stringify(eva.json));
      assert.equal(omar.status, 201, JSON.stringify(omar.json));
      state.eva = eva.json.data.employee;
      state.omar = omar.json.data.employee;
      state.evaPassword = eva.json.data.temporaryPassword;

      const first = await login(base, 'eva@example.com', state.evaPassword);
      await changePassword(base, first, state.evaPassword, 'eva-pass-123');
      state.evaCookie = await login(base, 'eva@example.com', 'eva-pass-123');

      const list = await request(base, '/api/employees', { cookie: state.evaCookie });
      assert.equal(list.status, 200);
      assert.equal(list.json.data.total, 1);
      assert.equal(list.json.data.items[0].id, state.eva.id);

      const other = await request(base, `/api/employees/${state.omar.id}`, { cookie: state.evaCookie });
      assert.equal(other.status, 403);
      assert.equal(other.json.message, 'You can only access your own records');

      const self = await request(base, `/api/employees/${state.eva.id}`, { cookie: state.evaCookie });
      assert.equal(self.status, 200, JSON.stringify(self.json));
      assert.equal(self.json.data.employee.name, 'Eva Employee');
      assert.equal(self.json.data.lastPayslip, null);
      assert.equal(self.json.data.leaveBalances.length, 4);
      const annual = self.json.data.leaveBalances.find((row) => row.code === 'ANNUAL');
      assert.equal(annual.quota, 14);
      assert.equal(annual.remaining, 14);
    });

    await t.test('camera check-in is rejected for face, accuracy, and distance', async () => {
      const face = await request(base, '/api/attendance/check-in', {
        method: 'POST',
        cookie: state.evaCookie,
        body: { source: 'camera', lat: 24.86, lng: 67.01, accuracy: 20, faceCount: 2 },
      });
      assert.equal(face.status, 422);
      assert.match(face.json.message, /one face/i);

      const accuracy = await request(base, '/api/attendance/check-in', {
        method: 'POST',
        cookie: state.evaCookie,
        body: { source: 'camera', lat: 24.86, lng: 67.01, accuracy: 250, faceCount: 1 },
      });
      assert.equal(accuracy.status, 422);
      assert.match(accuracy.json.message, /100 meters/);

      const far = await request(base, '/api/attendance/check-in', {
        method: 'POST',
        cookie: state.evaCookie,
        body: { source: 'camera', lat: 26, lng: 67.01, accuracy: 20, faceCount: 1 },
      });
      assert.equal(far.status, 422);
      assert.match(far.json.message, /outside the office/);

      const ok = await request(base, '/api/attendance/check-in', {
        method: 'POST',
        cookie: state.evaCookie,
        body: { source: 'camera', lat: 24.86, lng: 67.01, accuracy: 20, faceCount: 1 },
      });
      assert.equal(ok.status, 201, JSON.stringify(ok.json));
      assert.equal(ok.json.data.source, 'camera');
      assert.equal(ok.json.data.location.withinRadius, true);
      assert.equal(ok.json.data.faceCount, 1);
      assert.ok(ok.json.data.location.distanceMeters <= 150);

      const again = await request(base, '/api/attendance/check-in', {
        method: 'POST',
        cookie: state.evaCookie,
        body: { source: 'web' },
      });
      assert.equal(again.status, 409);
      assert.equal(again.json.message, 'Already checked in today');
    });

    await t.test('09:15 is present, 09:16 is late, and a short day is half_day', async () => {
      const actor = {
        id: state.eva.userId,
        role: 'employee',
        employeeId: state.eva.id,
        active: true,
      };
      const onTime = await checkIn(actor, { source: 'web' }, karachiWallTimeToUtc('2019-01-07', '09:15'));
      assert.equal(onTime.status, 'present');
      assert.equal(onTime.late, false);

      const late = await checkIn(actor, { source: 'web' }, karachiWallTimeToUtc('2019-01-08', '09:16'));
      assert.equal(late.status, 'late');
      assert.equal(late.late, true);

      await checkIn(actor, { source: 'web' }, karachiWallTimeToUtc('2019-01-09', '09:00'));
      const half = await checkOut(actor, {}, karachiWallTimeToUtc('2019-01-09', '13:00'));
      assert.equal(half.status, 'half_day');
      assert.equal(half.late, false);

      const changed = await request(base, '/api/settings', {
        method: 'PUT',
        cookie: state.admin,
        body: { graceMinutes: 120 },
      });
      assert.equal(changed.status, 200);
      const stored = await Attendance.findOne({ employee: state.eva.id, date: '2019-01-08' });
      assert.equal(stored.status, 'late');
      assert.equal(stored.late, true);

      // 2019-01-12 is Saturday. A short late visit must stay present and must not be a payroll day.
      const saturdayIn = await checkIn(actor, { source: 'web' }, karachiWallTimeToUtc('2019-01-12', '11:00'));
      assert.equal(saturdayIn.status, 'present');
      assert.equal(saturdayIn.late, false);
      const saturday = await checkOut(actor, {}, karachiWallTimeToUtc('2019-01-12', '12:00'));
      assert.equal(saturday.status, 'present');
      assert.equal(saturday.late, false);
      assert.ok(saturday.workedMinutes < 5 * 60);

      await Holiday.create({ date: '2019-01-14', name: 'Test holiday', tentative: true });
      await checkIn(actor, { source: 'web' }, karachiWallTimeToUtc('2019-01-14', '10:00'));
      const holiday = await checkOut(actor, {}, karachiWallTimeToUtc('2019-01-14', '12:00'));
      assert.equal(holiday.status, 'present');
      assert.equal(holiday.late, false);

      const offDays = await summarizeEmployeeAttendance(state.eva.id, '2019-01-12', '2019-01-14');
      assert.equal(offDays.workingDays, 0);
      assert.equal(offDays.halfDays, 0);
      assert.equal(offDays.lateDays, 0);
      assert.equal(offDays.presentDays, 0);
    });

    await t.test('approved correction writes attendance, and a used department cannot be deleted', async () => {
      const annual = await LeaveType.findOne({ code: 'ANNUAL' });
      await LeaveRequest.create({
        employee: state.omar.id,
        leaveType: annual._id,
        startDate: '2019-02-04',
        endDate: '2019-02-04',
        days: 1,
        reason: 'Sick',
        status: 'approved',
      });
      const board = await dailyBoard(
        { id: 'hr', role: 'hr', employeeId: null },
        { date: '2019-02-04' },
        '2019-02-05',
      );
      const eva = board.items.find((item) => item.employeeId === state.eva.id);
      const omar = board.items.find((item) => item.employeeId === state.omar.id);
      assert.equal(eva.status, 'absent');
      assert.equal(omar.status, 'on_leave');

      const correction = await request(base, '/api/attendance/corrections', {
        method: 'POST',
        cookie: state.evaCookie,
        body: {
          date: '2019-01-06',
          requestedCheckIn: '09:00',
          requestedCheckOut: '17:00',
          reason: 'Forgot to check in',
        },
      });
      assert.equal(correction.status, 201, JSON.stringify(correction.json));
      const review = await request(base, `/api/attendance/corrections/${correction.json.data.id}/review`, {
        method: 'POST',
        cookie: state.hr,
        body: { decision: 'approved', comment: 'Verified' },
      });
      assert.equal(review.status, 200, JSON.stringify(review.json));
      assert.equal(review.json.data.attendance.source, 'correction');
      assert.equal(review.json.data.attendance.status, 'present');

      const blocked = await request(base, `/api/departments/${state.departmentId}`, {
        method: 'DELETE',
        cookie: state.admin,
      });
      assert.equal(blocked.status, 409);
    });
  } finally {
    await stop(started.server);
    await mongoose.disconnect();
    await mongod.stop();
  }
});
