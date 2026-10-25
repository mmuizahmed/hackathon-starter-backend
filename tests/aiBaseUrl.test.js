import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-value';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.AI_API_KEY = 'super-secret-key-123456';
process.env.AI_BASE_URL = 'https://opencode.ai/inference/go/openai/v1';
delete process.env.MONGODB_URI;
delete process.env.ADMIN_EMAIL;
delete process.env.ADMIN_PASSWORD;
delete process.env.COMPANY_NAME;

const CHAT_URL = 'https://opencode.ai/inference/go/openai/v1/chat/completions';

test('AI base URL keeps the v1 path with or without a trailing slash', async () => {
  const { env, normalizeAiBaseUrl } = await import('../src/config/env.js');
  const forms = [
    'https://opencode.ai/inference/go/openai/v1',
    'https://opencode.ai/inference/go/openai/v1/',
  ];
  for (const input of forms) {
    const base = normalizeAiBaseUrl(input);
    assert.equal(base.endsWith('/'), true);
    assert.equal(new URL('chat/completions', base).href, CHAT_URL);
  }
  assert.equal(new URL('chat/completions', env.aiBaseUrl).href, CHAT_URL);
});

test('provider error detail keeps status and a redacted body, not the key', async () => {
  const { completeChat } = await import('../src/services/ai/provider.js');
  const key = process.env.AI_API_KEY;
  const body = `model missing ${key} Bearer ${key} ${'x'.repeat(400)}`;
  const original = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return {
      ok: false,
      status: 404,
      async text() {
        return body;
      },
    };
  };
  try {
    await assert.rejects(
      () => completeChat({ messages: [{ role: 'user', content: 'hi' }] }),
      (error) => {
        assert.equal(error.code, 'AI_PROVIDER');
        assert.equal(error.message, 'AI provider returned an error');
        assert.equal(error.message.includes(key), false);
        assert.match(error.detail, /^AI provider returned 404: /);
        assert.equal(error.detail.includes(key), false);
        assert.match(error.detail, /model missing/);
        assert.match(error.detail, /Bearer \[redacted\]/);
        const snippet = error.detail.slice('AI provider returned 404: '.length);
        assert.ok(snippet.length <= 200);
        return true;
      },
    );
    assert.equal(requestedUrl, CHAT_URL);
  } finally {
    globalThis.fetch = original;
  }
});
