import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-value';
process.env.CLIENT_URL = 'http://localhost:5173';
delete process.env.MONGODB_URI;
delete process.env.ADMIN_EMAIL;
delete process.env.ADMIN_PASSWORD;
delete process.env.COMPANY_NAME;

test('announcements and notification read state', { timeout: 180000 }, async () => {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const mongoose = (await import('mongoose')).default;
  const { listen, request, stop } = await import('./http.js');
  const { createCompany, createEmployee, login } = await import('./factory.js');
  const { notify } = await import('../src/services/notification.service.js');

  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const { default: app } = await import('../src/app.js');
  const started = await listen(app);
  const { base } = started;

  try {
    const { department, designation, hr } = await createCompany();
    const eva = await createEmployee({
      department, designation, name: 'Eva', email: 'eva@example.com', code: 'E-001',
    });
    await createEmployee({
      department, designation, name: 'Ali', email: 'ali@example.com', code: 'E-002',
    });
    const hrCookie = await login(base, 'hr@example.com', 'hr-pass-123');
    const evaCookie = await login(base, 'eva@example.com', 'eva-pass-123');
    const aliCookie = await login(base, 'ali@example.com', 'eva-pass-123');
    const adminCookie = await login(base, 'ada@example.com', 'correct-horse');

    const denied = await request(base, '/api/announcements', {
      method: 'POST',
      cookie: evaCookie,
      body: { title: 'Nope', body: 'Employees cannot post', audience: 'all' },
    });
    assert.equal(denied.status, 403);

    const posted = await request(base, '/api/announcements', {
      method: 'POST',
      cookie: hrCookie,
      body: { title: 'Office closed', body: 'Monday is a holiday.', audience: 'all' },
    });
    assert.equal(posted.status, 201, JSON.stringify(posted.json));
    assert.equal(posted.json.data.createdBy.name, 'Hassan HR');

    await request(base, '/api/announcements', {
      method: 'POST',
      cookie: adminCookie,
      body: { title: 'HR only', body: 'Please review payroll.', audience: 'hr' },
    });
    await request(base, '/api/announcements', {
      method: 'POST',
      cookie: adminCookie,
      body: { title: 'Old note', body: 'Ignore.', audience: 'all' },
    });
    const oldId = (await request(base, '/api/announcements?limit=1', { cookie: adminCookie })).json.data.items[0].id;
    await request(base, `/api/announcements/${oldId}`, {
      method: 'PATCH',
      cookie: adminCookie,
      body: { active: false },
    });

    const employeeList = await request(base, '/api/announcements?limit=10', { cookie: evaCookie });
    assert.equal(employeeList.status, 200);
    assert.ok(employeeList.json.data.items.every((item) => item.active && (item.audience === 'all' || item.audience === 'employee')));
    assert.equal(employeeList.json.data.items.some((item) => item.title === 'HR only'), false);

    const managed = await request(base, '/api/announcements?includeInactive=true&limit=10', { cookie: adminCookie });
    assert.ok(managed.json.data.items.some((item) => item.active === false));

    const page = await request(base, '/api/announcements?page=1&limit=1', { cookie: evaCookie });
    assert.equal(page.json.data.items.length, 1);
    assert.equal(page.json.data.limit, 1);
    assert.ok(page.json.data.total >= 1);

    await notify({
      userId: eva.user._id,
      title: 'Hello Eva',
      body: 'A test notice',
      type: 'system',
      entity: 'Announcement',
      entityId: posted.json.data.id,
    });
    await notify({
      userId: hr._id,
      title: 'Hello HR',
      body: 'Not Eva',
      type: 'system',
    });

    const unread = await request(base, '/api/notifications/unread-count', { cookie: evaCookie });
    assert.equal(unread.json.data.count, 1);
    const list = await request(base, '/api/notifications', { cookie: evaCookie });
    assert.equal(list.json.data.total, 1);
    assert.equal(list.json.data.unreadCount, 1);
    assert.equal(list.json.data.items[0].title, 'Hello Eva');

    const aliList = await request(base, '/api/notifications', { cookie: aliCookie });
    assert.equal(aliList.json.data.total, 0);
    const stolen = await request(base, `/api/notifications/${list.json.data.items[0].id}/read`, {
      method: 'POST',
      cookie: aliCookie,
    });
    assert.equal(stolen.status, 404);

    const read = await request(base, `/api/notifications/${list.json.data.items[0].id}/read`, {
      method: 'POST',
      cookie: evaCookie,
    });
    assert.equal(read.status, 200);
    assert.equal(read.json.data.read, true);
    const after = await request(base, '/api/notifications/unread-count', { cookie: evaCookie });
    assert.equal(after.json.data.count, 0);

    await notify({ userId: eva.user._id, title: 'Second', type: 'system' });
    const all = await request(base, '/api/notifications/read-all', { method: 'POST', cookie: evaCookie });
    assert.equal(all.status, 200);
    assert.equal(all.json.data.updated, 1);
    const hrStill = await request(base, '/api/notifications/unread-count', { cookie: hrCookie });
    assert.equal(hrStill.json.data.count, 1);
  } finally {
    await stop(started.server);
    await mongoose.disconnect();
    await mongod.stop();
  }
});
