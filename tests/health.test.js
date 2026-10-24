import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.JWT_SECRET = 'test-jwt-secret-value';
delete process.env.MONGODB_URI;
delete process.env.ADMIN_EMAIL;
delete process.env.ADMIN_PASSWORD;

const { default: app } = await import('../src/app.js');

test('GET /api/health reports the process is up', async () => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'ok');
    assert.equal(body.data.db, 'disconnected');
    assert.equal(typeof body.data.uptime, 'number');
  } finally {
    const closed = once(server, 'close');
    server.close();
    await closed;
  }
});
