import { once } from 'node:events';

export async function listen(app) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}

export async function stop(server) {
  const closed = once(server, 'close');
  server.close();
  await closed;
}

export async function request(base, path, { method = 'GET', body, cookie } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json();
  const setCookie = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [];
  const tokenCookie = setCookie
    .map((value) => value.split(';')[0])
    .find((value) => value.startsWith('token=')) || '';
  return { status: response.status, json, tokenCookie, setCookie };
}
