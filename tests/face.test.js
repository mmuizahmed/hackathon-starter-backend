import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-value';
process.env.CLIENT_URL = 'http://localhost:5173';
delete process.env.MONGODB_URI;
delete process.env.ADMIN_EMAIL;
delete process.env.ADMIN_PASSWORD;
delete process.env.COMPANY_NAME;

const SENTINEL = 0.424242;

function descriptor(length, fill = 0.02) {
  const values = Array.from({ length }, () => fill);
  values[0] = SENTINEL;
  return values;
}

function cameraBody(extra = {}) {
  return {
    source: 'camera',
    lat: 24.86,
    lng: 67.01,
    accuracy: 20,
    faceCount: 1,
    ...extra,
  };
}

function leaked(payload) {
  return JSON.stringify(payload).includes(String(SENTINEL));
}

test('face similarity matches the human library scale', async () => {
  const { similarity } = await import('../src/utils/faceMatch.js');
  const same = Array.from({ length: 64 }, (_, index) => index / 100);
  assert.equal(similarity(same, same.slice()), 1);

  // Hand check of the default call: order 2, multiplier 25, min 0.2, max 0.8.
  // sum of squares for (0,0) vs (3,4) is 25. distance = 25 * 25 = 625.
  // root = 25. (1 - 0.25 - 0.2) / 0.6 = 0.9166…, rounded to 0.92.
  assert.equal(similarity([0, 0], [3, 4]), 0.92);

  const other = same.map((value) => value + 4);
  const score = similarity(same, other);
  assert.ok(score >= 0 && score <= 1);
  assert.ok(score < 0.2, `expected a low score, got ${score}`);
});

test('face enroll, reset, and camera match', { timeout: 180000 }, async () => {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const mongoose = (await import('mongoose')).default;
  const { listen, request, stop } = await import('./http.js');
  const { createCompany, createEmployee, login } = await import('./factory.js');
  const { Attendance } = await import('../src/models/Attendance.js');
  const { Employee } = await import('../src/models/Employee.js');
  const { Settings } = await import('../src/models/Settings.js');

  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const { default: app } = await import('../src/app.js');
  const { chatSystemPrompt, policySystemPrompt } = await import('../src/services/ai/prompts.js');
  const { omitFaceSecrets, runTool } = await import('../src/services/ai/tools.js');
  const started = await listen(app);
  const { base } = started;

  try {
    const { department, designation } = await createCompany();
    await Settings.updateOne(
      { key: 'company' },
      { $set: { officeLat: 24.86, officeLng: 67.01, radiusMeters: 150 } },
    );
    const eva = await createEmployee({
      department,
      designation,
      name: 'Eva',
      email: 'eva@example.com',
      code: 'E-001',
    });
    const ali = await createEmployee({
      department,
      designation,
      name: 'Ali',
      email: 'ali@example.com',
      code: 'E-002',
    });
    const evaId = eva.employee._id.toString();
    const hrCookie = await login(base, 'hr@example.com', 'hr-pass-123');
    const adminCookie = await login(base, 'ada@example.com', 'correct-horse');
    const evaCookie = await login(base, 'eva@example.com', 'eva-pass-123');
    const aliCookie = await login(base, 'ali@example.com', 'eva-pass-123');
    const enrolledFace = descriptor(64);

    const anon = await request(base, '/api/face/me');
    assert.equal(anon.status, 401);

    const before = await request(base, '/api/face/me', { cookie: evaCookie });
    assert.equal(before.status, 200, JSON.stringify(before.json));
    assert.deepEqual(before.json.data, { enrolled: false, enrolledAt: null, model: null });

    const hrBlocked = await request(base, '/api/face/me', { cookie: hrCookie });
    assert.equal(hrBlocked.status, 403);

    const noEnroll = await request(base, '/api/attendance/check-in', {
      method: 'POST',
      cookie: evaCookie,
      body: cameraBody({ descriptor: enrolledFace, liveness: { blink: true } }),
    });
    assert.equal(noEnroll.status, 422);
    assert.equal(noEnroll.json.message, 'Enroll your face first');
    assert.equal(leaked(noEnroll.json), false);

    const created = await request(base, '/api/face/enroll', {
      method: 'POST',
      cookie: evaCookie,
      body: { descriptor: enrolledFace, model: 'human-faceres' },
    });
    assert.equal(created.status, 201, JSON.stringify(created.json));
    assert.equal(created.json.data.enrolled, true);
    assert.equal(created.json.data.model, 'human-faceres');
    assert.ok(created.json.data.enrolledAt);
    assert.equal(Object.hasOwn(created.json.data, 'faceDescriptor'), false);
    assert.equal(Object.hasOwn(created.json.data, 'descriptor'), false);
    assert.equal(leaked(created.json), false);

    const again = await request(base, '/api/face/enroll', {
      method: 'POST',
      cookie: evaCookie,
      body: { descriptor: descriptor(64, 0.9), model: 'human-faceres' },
    });
    assert.equal(again.status, 409);
    assert.equal(again.json.message, 'Face already enrolled. Ask HR to reset it.');

    const short = await request(base, '/api/face/enroll', {
      method: 'POST',
      cookie: evaCookie,
      body: { descriptor: descriptor(10), model: 'human-faceres' },
    });
    assert.equal(short.status, 400);
    assert.equal(leaked(short.json), false);

    const detail = await request(base, `/api/employees/${evaId}`, { cookie: hrCookie });
    assert.equal(detail.status, 200, JSON.stringify(detail.json));
    assert.equal(detail.json.data.employee.faceEnrolled, true);
    assert.equal(Object.hasOwn(detail.json.data.employee, 'faceDescriptor'), false);
    assert.equal(leaked(detail.json), false);

    const list = await request(base, '/api/employees', { cookie: hrCookie });
    const evaRow = list.json.data.items.find((row) => row.id === evaId);
    assert.equal(evaRow.faceEnrolled, true);
    assert.equal(leaked(list.json), false);

    const self = await request(base, `/api/employees/${evaId}`, { cookie: evaCookie });
    assert.equal(self.json.data.employee.faceEnrolled, true);
    assert.equal(leaked(self.json), false);

    const noBlink = await request(base, '/api/attendance/check-in', {
      method: 'POST',
      cookie: evaCookie,
      body: cameraBody({ descriptor: enrolledFace, liveness: { blink: false } }),
    });
    assert.equal(noBlink.status, 422);
    assert.equal(noBlink.json.message, 'Blink check failed');
    assert.equal(leaked(noBlink.json), false);

    const wrongLength = await request(base, '/api/attendance/check-in', {
      method: 'POST',
      cookie: evaCookie,
      body: cameraBody({ descriptor: descriptor(80), liveness: { blink: true } }),
    });
    assert.equal(wrongLength.status, 422);
    assert.equal(wrongLength.json.message, 'Face descriptor length does not match the enrolled face');
    assert.equal(leaked(wrongLength.json), false);

    const mismatch = await request(base, '/api/attendance/check-in', {
      method: 'POST',
      cookie: evaCookie,
      body: cameraBody({ descriptor: descriptor(64, 9), liveness: { blink: true } }),
    });
    assert.equal(mismatch.status, 422);
    assert.equal(mismatch.json.message, 'Face does not match the enrolled face');
    assert.equal(leaked(mismatch.json), false);
    assert.equal(await Attendance.countDocuments({ employee: evaId }), 0);

    const contact = await request(base, `/api/employees/${evaId}`, {
      method: 'PATCH',
      cookie: evaCookie,
      body: { phone: '03001234567' },
    });
    assert.equal(contact.status, 200, JSON.stringify(contact.json));
    assert.equal(contact.json.data.faceEnrolled, true);
    assert.equal(leaked(contact.json), false);
    const stored = await Employee.findById(evaId).select('+faceDescriptor');
    assert.equal(stored.faceDescriptor[0], SENTINEL);
    assert.equal(stored.faceDescriptor.length, 64);

    const ok = await request(base, '/api/attendance/check-in', {
      method: 'POST',
      cookie: evaCookie,
      body: cameraBody({ descriptor: enrolledFace, liveness: { blink: true } }),
    });
    assert.equal(ok.status, 201, JSON.stringify(ok.json));
    assert.equal(ok.json.data.source, 'camera');
    assert.equal(ok.json.data.faceCount, 1);
    assert.equal(ok.json.data.faceMatchScore, 1);
    assert.equal(ok.json.data.liveness, true);
    assert.equal(Object.hasOwn(ok.json.data, 'descriptor'), false);
    assert.equal(leaked(ok.json), false);

    const attendance = await request(base, '/api/attendance', { cookie: evaCookie });
    assert.equal(attendance.json.data.items[0].faceMatchScore, 1);
    assert.equal(attendance.json.data.items[0].liveness, true);
    assert.equal(leaked(attendance.json), false);

    const evaUser = {
      id: eva.user._id.toString(),
      role: 'employee',
      employeeId: evaId,
      active: true,
    };
    const searched = await runTool(evaUser, 'search_employees', { search: 'Eva' });
    assert.equal(searched.items[0].faceEnrolled, true);
    assert.equal(Object.hasOwn(searched.items[0], 'faceDescriptor'), false);
    assert.equal(leaked(searched), false);
    const hidden = omitFaceSecrets({
      faceEnrolled: true,
      faceDescriptor: enrolledFace,
      descriptor: enrolledFace,
      embedding: enrolledFace,
      nested: { descriptor: enrolledFace },
    });
    assert.deepEqual(hidden, { faceEnrolled: true, nested: {} });

    const facts = {
      today: '2026-10-25',
      settings: {
        companyName: 'Saylani',
        officeStart: '09:00',
        graceMinutes: 15,
        halfDayHours: 5,
        weekend: ['Sat', 'Sun'],
        radiusMeters: 150,
      },
      types: [],
    };
    const prompt = `${policySystemPrompt(facts)}\n${chatSystemPrompt(facts)}`;
    assert.match(prompt, /Never ask for, repeat, or invent a face descriptor/);
    assert.equal(prompt.includes(String(SENTINEL)), false);

    const audit = await request(base, '/api/audit?action=face.enroll', { cookie: adminCookie });
    assert.equal(audit.status, 200, JSON.stringify(audit.json));
    assert.equal(audit.json.data.items[0].after.enrolled, true);
    assert.equal(audit.json.data.items[0].after.model, 'human-faceres');
    assert.equal(Object.hasOwn(audit.json.data.items[0].after, 'faceDescriptor'), false);
    assert.equal(Object.hasOwn(audit.json.data.items[0].after, 'descriptor'), false);
    assert.equal(leaked(audit.json), false);

    const checkoutBlink = await request(base, '/api/attendance/check-out', {
      method: 'POST',
      cookie: evaCookie,
      body: cameraBody({ descriptor: enrolledFace, liveness: { blink: false } }),
    });
    assert.equal(checkoutBlink.status, 422);
    assert.equal(checkoutBlink.json.message, 'Blink check failed');
    const stillOpen = await Attendance.findOne({ employee: evaId });
    assert.equal(stillOpen.checkOut, null);
    assert.equal(stillOpen.faceMatchScore, 1);

    const checkoutMismatch = await request(base, '/api/attendance/check-out', {
      method: 'POST',
      cookie: evaCookie,
      body: cameraBody({ descriptor: descriptor(64, 9), liveness: { blink: true } }),
    });
    assert.equal(checkoutMismatch.status, 422);
    assert.equal(checkoutMismatch.json.message, 'Face does not match the enrolled face');
    assert.equal((await Attendance.findOne({ employee: evaId })).checkOut, null);

    const checkout = await request(base, '/api/attendance/check-out', {
      method: 'POST',
      cookie: evaCookie,
      body: cameraBody({ descriptor: enrolledFace, liveness: { blink: true } }),
    });
    assert.equal(checkout.status, 200, JSON.stringify(checkout.json));
    assert.equal(checkout.json.data.source, 'camera');
    assert.ok(checkout.json.data.checkOut);
    assert.equal(checkout.json.data.liveness, true);
    assert.equal(checkout.json.data.faceMatchScore, 1);
    assert.equal(leaked(checkout.json), false);

    const web = await request(base, '/api/attendance/check-in', {
      method: 'POST',
      cookie: aliCookie,
      body: { source: 'web', descriptor: enrolledFace, liveness: { blink: false } },
    });
    assert.equal(web.status, 201, JSON.stringify(web.json));
    assert.equal(web.json.data.source, 'web');
    assert.equal(web.json.data.faceMatchScore, null);
    assert.equal(web.json.data.liveness, null);
    assert.equal(leaked(web.json), false);

    const employeeReset = await request(base, `/api/face/${evaId}`, {
      method: 'DELETE',
      cookie: evaCookie,
    });
    assert.equal(employeeReset.status, 403);

    const reset = await request(base, `/api/face/${evaId}`, {
      method: 'DELETE',
      cookie: hrCookie,
    });
    assert.equal(reset.status, 200, JSON.stringify(reset.json));
    assert.deepEqual(reset.json.data, { employeeId: evaId, enrolled: false });
    assert.equal(leaked(reset.json), false);

    const cleared = await request(base, '/api/face/me', { cookie: evaCookie });
    assert.deepEqual(cleared.json.data, { enrolled: false, enrolledAt: null, model: null });
    const clearedDetail = await request(base, `/api/employees/${evaId}`, { cookie: hrCookie });
    assert.equal(clearedDetail.json.data.employee.faceEnrolled, false);
    const wiped = await Employee.findById(evaId).select('+faceDescriptor').lean();
    const storedDescriptor = wiped.faceDescriptor || [];
    assert.equal(storedDescriptor.length, 0);
    assert.equal(storedDescriptor.includes(SENTINEL), false);
    assert.equal(wiped.faceEnrolledAt, null);

    const resetAudit = await request(base, '/api/audit?action=face.reset', { cookie: adminCookie });
    assert.equal(resetAudit.status, 200, JSON.stringify(resetAudit.json));
    assert.equal(resetAudit.json.data.items[0].before.enrolled, true);
    assert.equal(resetAudit.json.data.items[0].after.enrolled, false);
    assert.equal(leaked(resetAudit.json), false);

    const reenroll = await request(base, '/api/face/enroll', {
      method: 'POST',
      cookie: evaCookie,
      body: { descriptor: enrolledFace, model: 'human-faceres' },
    });
    assert.equal(reenroll.status, 201, JSON.stringify(reenroll.json));

    const adminReset = await request(base, `/api/face/${evaId}`, {
      method: 'DELETE',
      cookie: adminCookie,
    });
    assert.equal(adminReset.status, 200, JSON.stringify(adminReset.json));
    assert.equal(adminReset.json.data.enrolled, false);

    const missing = await request(base, '/api/face/507f1f77bcf86cd799439011', {
      method: 'DELETE',
      cookie: hrCookie,
    });
    assert.equal(missing.status, 404);
  } finally {
    await stop(started.server);
    await mongoose.disconnect();
    await mongod.stop();
  }
});
