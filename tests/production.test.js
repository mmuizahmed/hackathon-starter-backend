import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = 'test-jwt-secret-value';
process.env.CLIENT_URL = 'http://localhost:5173';
delete process.env.MONGODB_URI;
delete process.env.ADMIN_EMAIL;
delete process.env.ADMIN_PASSWORD;
delete process.env.COMPANY_NAME;
delete process.env.AI_API_KEY;

test('production proxy, cookies, CORS, and error hiding', { timeout: 180000 }, async () => {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const mongoose = (await import('mongoose')).default;
  const { listen, request, stop } = await import('./http.js');
  const { errorHandler } = await import('../src/middleware/errorHandler.js');

  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const { default: app } = await import('../src/app.js');
  const started = await listen(app);
  const { base } = started;

  try {
    assert.equal(app.get('trust proxy'), 1);

    const boom = new Error('mongo password secret-stack');
    boom.stack = 'Error: mongo password secret-stack\n    at secret.js:1:1';
    let statusCode;
    let body;
    const res = {
      headersSent: false,
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        body = payload;
      },
    };
    errorHandler(boom, {}, res, () => {});
    assert.equal(statusCode, 500);
    assert.equal(body.message, 'Internal server error');
    assert.equal(JSON.stringify(body).includes('secret-stack'), false);
    assert.equal(JSON.stringify(body).includes('secret.js'), false);
    assert.equal(body.stack, undefined);

    const setup = await request(base, '/api/setup', {
      method: 'POST',
      body: {
        companyName: 'Saylani',
        adminName: 'Ada Admin',
        adminEmail: 'ada@example.com',
        adminPassword: 'correct-horse',
      },
    });
    assert.equal(setup.status, 201, JSON.stringify(setup.json));
    const cookie = setup.setCookie[0];
    const attrs = cookie.split(';').slice(1).join(';');
    assert.match(cookie, /HttpOnly/i);
    assert.match(attrs, /Secure/i);
    assert.match(attrs, /SameSite=Lax/i);
    assert.doesNotMatch(attrs, /Domain=/i);

    const allowed = await fetch(`${base}/api/health`, {
      headers: { origin: 'http://localhost:5173' },
    });
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');
    const blocked = await fetch(`${base}/api/health`, {
      headers: { origin: 'https://evil.example' },
    });
    assert.equal(blocked.headers.get('access-control-allow-origin'), null);

    const badJson = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    const badJsonBody = await badJson.json();
    assert.equal(badJson.status, 400);
    assert.equal(badJsonBody.message, 'Request body must be valid JSON');
    assert.equal(JSON.stringify(badJsonBody).includes('stack'), false);

    const tooBig = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(1_100_000) }),
    });
    const tooBigBody = await tooBig.json();
    assert.equal(tooBig.status, 413);
    assert.equal(tooBigBody.message, 'Request body is too large');

    const badId = await request(base, '/api/employees/not-an-id');
    assert.equal(badId.status, 400);
    assert.equal(badId.json.message, 'Validation failed');
    assert.equal(badId.json.errors[0].path, 'id');

    const realId = '507f1f77bcf86cd799439011';
    const missingCookie = await request(base, `/api/employees/${realId}`);
    assert.equal(missingCookie.status, 401);

    for (let i = 0; i < 10; i += 1) {
      const attempt = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.10',
        },
        body: JSON.stringify({ email: 'nobody@example.com', password: 'wrong-pass' }),
      });
      assert.equal(attempt.status, 401, `attempt ${i + 1} should still be a bad login`);
    }
    const limited = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.10',
      },
      body: JSON.stringify({ email: 'nobody@example.com', password: 'wrong-pass' }),
    });
    const limitedBody = await limited.json();
    assert.equal(limited.status, 429);
    assert.match(limitedBody.message, /Too many login attempts/);

    const otherIp = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.11',
      },
      body: JSON.stringify({ email: 'nobody@example.com', password: 'wrong-pass' }),
    });
    assert.equal(otherIp.status, 401);
  } finally {
    await stop(started.server);
    await mongoose.disconnect();
    await mongod.stop();
  }
});
