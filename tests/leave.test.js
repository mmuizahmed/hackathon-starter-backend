import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-value';
process.env.CLIENT_URL = 'http://localhost:5173';
delete process.env.MONGODB_URI;
delete process.env.ADMIN_EMAIL;
delete process.env.ADMIN_PASSWORD;
delete process.env.COMPANY_NAME;

test('leave balances, overlap, approval context, and cancel rules', { timeout: 180000 }, async () => {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const mongoose = (await import('mongoose')).default;
  const { listen, request, stop } = await import('./http.js');
  const { createCompany, createEmployee, login } = await import('./factory.js');
  const { addDays, karachiDateString, weekdayName } = await import('../src/utils/timezone.js');
  const { Holiday } = await import('../src/models/Holiday.js');
  const { LeaveRequest } = await import('../src/models/LeaveRequest.js');
  const { LeaveType } = await import('../src/models/LeaveType.js');
  const { AuditLog } = await import('../src/models/AuditLog.js');

  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const { default: app } = await import('../src/app.js');
  const started = await listen(app);
  const { base } = started;

  try {
    const { department, designation } = await createCompany();
    const eva = await createEmployee({
      department, designation, name: 'Eva', email: 'eva@example.com', code: 'E-001',
    });
    const ali = await createEmployee({
      department, designation, name: 'Ali', email: 'ali@example.com', code: 'E-002',
    });
    const hrCookie = await login(base, 'hr@example.com', 'hr-pass-123');
    const evaCookie = await login(base, 'eva@example.com', 'eva-pass-123');
    const aliCookie = await login(base, 'ali@example.com', 'eva-pass-123');
    const adminCookie = await login(base, 'ada@example.com', 'correct-horse');

    const types = await LeaveType.find().lean();
    const byCode = Object.fromEntries(types.map((row) => [row.code, row._id.toString()]));

    let friday = karachiDateString();
    for (let step = 0; step < 14; step += 1) {
      if (weekdayName(friday) === 'Fri') break;
      friday = addDays(friday, 1);
    }
    const monday = addDays(friday, 3);
    await Holiday.create({ date: monday, name: 'Test holiday', tentative: true });

    const applied = await request(base, '/api/leave/requests', {
      method: 'POST',
      cookie: evaCookie,
      body: { leaveTypeId: byCode.CASUAL, startDate: friday, endDate: monday, reason: 'Family event' },
    });
    assert.equal(applied.status, 201, JSON.stringify(applied.json));
    assert.equal(applied.json.data.days, 1);
    assert.equal(applied.json.data.status, 'pending');
    assert.equal(applied.json.data.context, undefined);

    const overlap = await request(base, '/api/leave/requests', {
      method: 'POST',
      cookie: evaCookie,
      body: { leaveTypeId: byCode.ANNUAL, startDate: friday, endDate: friday, reason: 'Same day' },
    });
    assert.equal(overlap.status, 422);
    assert.match(overlap.json.message, /overlap/i);

    const longStart = addDays(monday, 1);
    const longEnd = addDays(longStart, 40);
    const tooMuch = await request(base, '/api/leave/requests', {
      method: 'POST',
      cookie: evaCookie,
      body: { leaveTypeId: byCode.ANNUAL, startDate: longStart, endDate: longEnd, reason: 'Long break' },
    });
    assert.equal(tooMuch.status, 422);
    assert.match(tooMuch.json.message, /only 14 remain/);

    const unpaid = await request(base, '/api/leave/requests', {
      method: 'POST',
      cookie: evaCookie,
      body: { leaveTypeId: byCode.UNPAID, startDate: longStart, endDate: longEnd, reason: 'Unpaid stretch' },
    });
    assert.equal(unpaid.status, 201, JSON.stringify(unpaid.json));
    assert.ok(unpaid.json.data.days > 14);

    const balances = await request(base, `/api/leave/balances?year=${friday.slice(0, 4)}`, { cookie: evaCookie });
    assert.equal(balances.status, 200);
    const casual = balances.json.data.items.find((item) => item.code === 'CASUAL');
    const annual = balances.json.data.items.find((item) => item.code === 'ANNUAL');
    const unpaidBalance = balances.json.data.items.find((item) => item.code === 'UNPAID');
    assert.equal(casual.leaveTypeId, byCode.CASUAL);
    assert.equal(casual.name, 'Casual');
    assert.equal(casual.quota, 10);
    assert.equal(casual.used, 0);
    assert.equal(casual.remaining, 10);
    assert.equal(casual.pending, 1);
    assert.equal(annual.leaveTypeId, byCode.ANNUAL);
    assert.equal(annual.name, 'Annual');

    const typeList = await request(base, '/api/leave-types', { cookie: evaCookie });
    assert.equal(typeList.status, 200, JSON.stringify(typeList.json));
    const listedCasual = typeList.json.data.items.find((item) => item.code === 'CASUAL');
    assert.equal(listedCasual.id, casual.leaveTypeId);

    const createType = await request(base, '/api/leave-types', {
      method: 'POST',
      cookie: evaCookie,
      body: { name: 'Extra', code: 'EXTRA', yearlyQuota: 1, paid: true },
    });
    assert.equal(createType.status, 403);

    let later = addDays(longEnd, 7);
    for (let step = 0; step < 7; step += 1) {
      if (weekdayName(later) !== 'Sat' && weekdayName(later) !== 'Sun') break;
      later = addDays(later, 1);
    }
    const fromBalance = await request(base, '/api/leave/requests', {
      method: 'POST',
      cookie: evaCookie,
      body: {
        leaveTypeId: casual.leaveTypeId,
        startDate: later,
        endDate: later,
        reason: 'Using the id from balances',
      },
    });
    assert.equal(fromBalance.status, 201, JSON.stringify(fromBalance.json));
    assert.equal(fromBalance.json.data.leaveType.code, 'CASUAL');
    assert.equal(annual.remaining, 14);
    assert.equal(annual.pending, 0);
    assert.equal(unpaidBalance.quota, null);
    assert.equal(unpaidBalance.remaining, null);
    assert.ok(unpaidBalance.pending > 14);

    const aliLeave = await request(base, '/api/leave/requests', {
      method: 'POST',
      cookie: aliCookie,
      body: { leaveTypeId: byCode.SICK, startDate: friday, endDate: monday, reason: 'Clinic' },
    });
    assert.equal(aliLeave.status, 201, JSON.stringify(aliLeave.json));

    await LeaveRequest.updateOne(
      { _id: applied.json.data.id },
      { status: 'approved' },
    );
    const inbox = await request(base, '/api/leave/requests?status=pending', { cookie: hrCookie });
    assert.equal(inbox.status, 200);
    const aliRow = inbox.json.data.items.find((item) => item.id === aliLeave.json.data.id);
    assert.ok(aliRow);
    assert.equal(aliRow.context.balance.before, 8);
    assert.equal(aliRow.context.balance.after, 7);
    assert.equal(aliRow.context.holidays[0].date, monday);
    assert.equal(aliRow.context.colleaguesOnLeave.length, 1);
    assert.equal(aliRow.context.colleaguesOnLeave[0].name, 'Eva');
    assert.equal(aliRow.context.approvedThisYear.length, 0);

    const ownList = await request(base, '/api/leave/requests', { cookie: aliCookie });
    assert.equal(ownList.json.data.items[0].context, undefined);
    const other = await request(base, `/api/leave/balances?employeeId=${eva.employee._id}`, { cookie: aliCookie });
    assert.equal(other.status, 403);

    const noComment = await request(base, `/api/leave/requests/${aliLeave.json.data.id}/review`, {
      method: 'POST',
      cookie: hrCookie,
      body: { decision: 'rejected' },
    });
    assert.equal(noComment.status, 400);

    const employeeReview = await request(base, `/api/leave/requests/${aliLeave.json.data.id}/review`, {
      method: 'POST',
      cookie: evaCookie,
      body: { decision: 'approved' },
    });
    assert.equal(employeeReview.status, 403);

    const rejected = await request(base, `/api/leave/requests/${aliLeave.json.data.id}/review`, {
      method: 'POST',
      cookie: hrCookie,
      body: { decision: 'rejected', comment: 'Please use casual leave' },
    });
    assert.equal(rejected.status, 200, JSON.stringify(rejected.json));
    assert.equal(rejected.json.data.status, 'rejected');

    const notes = await request(base, '/api/notifications', { cookie: aliCookie });
    assert.equal(notes.json.data.unreadCount, 1);
    assert.equal(notes.json.data.items[0].type, 'leave');
    assert.match(notes.json.data.items[0].body, /rejected/i);

    const pastCancel = await request(base, `/api/leave/requests/${applied.json.data.id}/cancel`, {
      method: 'POST',
      cookie: evaCookie,
    });
    if (friday > karachiDateString()) {
      assert.equal(pastCancel.status, 200, JSON.stringify(pastCancel.json));
    } else {
      assert.equal(pastCancel.status, 422);
      assert.match(pastCancel.json.message, /has not started/);
    }

    const hrCancel = await request(base, `/api/leave/requests/${unpaid.json.data.id}/cancel`, {
      method: 'POST',
      cookie: hrCookie,
    });
    assert.equal(hrCancel.status, 403);
    const evaCancelsUnpaid = await request(base, `/api/leave/requests/${unpaid.json.data.id}/cancel`, {
      method: 'POST',
      cookie: evaCookie,
    });
    assert.equal(evaCancelsUnpaid.status, 200, JSON.stringify(evaCancelsUnpaid.json));

    const futureStart = addDays(karachiDateString(), 21);
    let cursor = futureStart;
    if (weekdayName(cursor) === 'Sat') cursor = addDays(cursor, 2);
    if (weekdayName(cursor) === 'Sun') cursor = addDays(cursor, 1);
    const futureEnd = addDays(cursor, 2);
    const future = await request(base, '/api/leave/requests', {
      method: 'POST',
      cookie: evaCookie,
      body: { leaveTypeId: byCode.ANNUAL, startDate: cursor, endDate: futureEnd, reason: 'Trip' },
    });
    assert.equal(future.status, 201, JSON.stringify(future.json));
    const approved = await request(base, `/api/leave/requests/${future.json.data.id}/review`, {
      method: 'POST',
      cookie: hrCookie,
      body: { decision: 'approved', comment: 'Enjoy' },
    });
    assert.equal(approved.status, 200, JSON.stringify(approved.json));
    const cancelled = await request(base, `/api/leave/requests/${future.json.data.id}/cancel`, {
      method: 'POST',
      cookie: evaCookie,
    });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.json));
    assert.equal(cancelled.json.data.status, 'cancelled');

    const audit = await request(base, '/api/audit?action=leave.review', { cookie: adminCookie });
    assert.equal(audit.status, 200);
    assert.ok(audit.json.data.total >= 1);
    assert.equal(await AuditLog.countDocuments({ action: 'leave.apply' }) >= 1, true);
  } finally {
    await stop(started.server);
    await mongoose.disconnect();
    await mongod.stop();
  }
});
