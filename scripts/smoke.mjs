// Demo flow against a running API. No npm dependencies: Node 22 fetch plus a cookie jar per role.
// Usage: BASE_URL=http://127.0.0.1:5000 node scripts/smoke.mjs
// This creates the company. Wipe the database afterwards if judges still need the setup screen.

const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

const results = [];

function karachiToday(date = new Date()) {
  const pkt = new Date(date.getTime() + PKT_OFFSET_MS);
  const year = pkt.getUTCFullYear();
  const month = String(pkt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(pkt.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(dateStr, days) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function weekdayIndex(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

// "Next Monday" is the upcoming Monday after today, then the Tuesday that follows it.
function nextMondayTuesday(today) {
  const delta = (1 - weekdayIndex(today) + 7) % 7 || 7;
  const monday = addDays(today, delta);
  return { monday, tuesday: addDays(monday, 1) };
}

class Jar {
  constructor() {
    this.token = '';
  }

  absorb(response) {
    const lines = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [];
    for (const line of lines) {
      const pair = line.split(';')[0];
      if (pair.startsWith('token=')) {
        this.token = decodeURIComponent(pair.slice('token='.length));
      }
    }
  }
}

async function api(jar, path, { method = 'GET', body } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(jar?.token ? { cookie: `token=${jar.token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (jar) jar.absorb(response);
  const type = response.headers.get('content-type') || '';
  if (type.includes('application/pdf') || type.includes('text/csv')) {
    const buffer = Buffer.from(await response.arrayBuffer());
    return { status: response.status, type, buffer, json: null };
  }
  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 200) };
    }
  }
  return { status: response.status, type, json, buffer: null };
}

function detail(value) {
  if (value == null) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 240 ? `${text.slice(0, 240)}…` : text;
}

async function step(name, fn) {
  try {
    const outcome = await fn();
    if (outcome && outcome.skip) {
      console.log(`SKIP  ${name}`);
      if (outcome.note) console.log(`      ${outcome.note}`);
      results.push('SKIP');
      return outcome;
    }
    console.log(`PASS  ${name}`);
    if (outcome && outcome.note) console.log(`      ${outcome.note}`);
    results.push('PASS');
    return outcome;
  } catch (error) {
    console.log(`FAIL  ${name}`);
    console.log(`      ${error.message}`);
    results.push('FAIL');
    return null;
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function expectStatus(res, status, label) {
  expect(res.status === status, `${label}: expected ${status}, got ${res.status} ${detail(res.json)}`);
}

function providerDown(json) {
  const data = json?.data || {};
  const text = `${data.answer || ''} ${data.message || ''}`;
  return /not configured|could not reach|took too long/i.test(text);
}

function salaryLeaked(answer, amounts) {
  const text = String(answer || '');
  return amounts.some((amount) => text.includes(String(amount)) || text.includes(Number(amount).toLocaleString('en-US')));
}

console.log(`Smoke ${BASE_URL}`);

const stamp = Date.now().toString();
const today = karachiToday();
const month = today.slice(0, 7);
const joinDate = `${month}-01`;
const { monday, tuesday } = nextMondayTuesday(today);
let holidayDate = addDays(today, 50);
if (holidayDate === monday || holidayDate === tuesday) holidayDate = addDays(holidayDate, 3);

const adminEmail = `admin.${stamp}@example.com`;
const hrEmail = `hr.${stamp}@example.com`;
const evaEmail = `eva.${stamp}@example.com`;
const aliEmail = `ali.${stamp}@example.com`;
const adminPassword = 'correct-horse';
const hrTemp = 'hr-pass-123';
const hrPassword = 'hr-pass-456';
const evaPassword = 'eva-pass-123';
const aliBasic = 173000;

const admin = new Jar();
const hr = new Jar();
const eva = new Jar();

let departmentId;
let designationId;
let casualId;
let evaEmployeeId;
let aliEmployeeId;
let evaTemp;
let leaveId;
let runId;
let checksOk;
let evaPayslipId;
let aliPayslipId;
let aiDown = false;

await step('setup status is not initialized', async () => {
  const res = await api(null, '/api/setup/status');
  expectStatus(res, 200, 'status');
  expect(res.json?.data?.initialized === false, `expected a fresh database, got ${detail(res.json)}`);
});

await step('first-run setup creates the admin', async () => {
  const res = await api(admin, '/api/setup', {
    method: 'POST',
    body: {
      companyName: 'Saylani Smoke',
      adminName: 'Ada Admin',
      adminEmail,
      adminPassword,
    },
  });
  expectStatus(res, 201, 'setup');
  expect(res.json.data.user.role === 'admin', 'setup did not return an admin');
  expect(admin.token, 'setup did not set the token cookie');
});

await step('admin creates a department', async () => {
  const res = await api(admin, '/api/departments', {
    method: 'POST',
    body: { name: 'Engineering' },
  });
  expectStatus(res, 201, 'department');
  departmentId = res.json.data.id;
  expect(departmentId, 'department id missing');
});

await step('admin creates a designation', async () => {
  const res = await api(admin, '/api/designations', {
    method: 'POST',
    body: { name: 'Engineer' },
  });
  expectStatus(res, 201, 'designation');
  designationId = res.json.data.id;
  expect(designationId, 'designation id missing');
});

await step('admin creates a holiday', async () => {
  const res = await api(admin, '/api/holidays', {
    method: 'POST',
    body: { date: holidayDate, name: 'Smoke Holiday' },
  });
  expectStatus(res, 201, 'holiday');
  expect(res.json.data.date === holidayDate, 'holiday date was not stored');
});

await step('admin creates an HR login', async () => {
  const res = await api(admin, '/api/users', {
    method: 'POST',
    body: { name: 'Hassan HR', email: hrEmail, password: hrTemp },
  });
  expectStatus(res, 201, 'hr user');
  expect(res.json.data.user.role === 'hr', 'created user is not HR');
  expect(res.json.data.temporaryPassword === hrTemp, 'temporary password was not returned');
});

await step('HR is blocked until the temporary password changes', async () => {
  const login = await api(hr, '/api/auth/login', {
    method: 'POST',
    body: { email: hrEmail, password: hrTemp },
  });
  expectStatus(login, 200, 'hr login');
  expect(hr.token, 'HR login did not set a cookie');
  const blocked = await api(hr, '/api/employees');
  expectStatus(blocked, 403, 'hr gate');
  expect(blocked.json.message === 'Password change required', detail(blocked.json));
  const changed = await api(hr, '/api/auth/change-password', {
    method: 'POST',
    body: { currentPassword: hrTemp, newPassword: hrPassword },
  });
  expectStatus(changed, 200, 'hr change password');
  const open = await api(hr, '/api/employees');
  expectStatus(open, 200, 'hr employees after change');
});

await step('HR registers two employees and captures temporary passwords', async () => {
  const types = await api(hr, '/api/leave-types?limit=100');
  expectStatus(types, 200, 'leave types');
  const casual = types.json.data.items.find((row) => row.code === 'CASUAL');
  expect(casual, 'CASUAL leave type was not created by setup');
  casualId = casual.id;

  const evaRes = await api(hr, '/api/employees', {
    method: 'POST',
    body: {
      code: `E${stamp.slice(-6)}`,
      name: 'Eva Khan',
      email: evaEmail,
      departmentId,
      designationId,
      joinDate,
      basicSalary: 100000,
    },
  });
  expectStatus(evaRes, 201, 'eva');
  evaEmployeeId = evaRes.json.data.employee.id;
  evaTemp = evaRes.json.data.temporaryPassword;
  expect(evaTemp, 'Eva temporary password missing');

  const aliRes = await api(hr, '/api/employees', {
    method: 'POST',
    body: {
      code: `A${stamp.slice(-6)}`,
      name: 'Ali Raza',
      email: aliEmail,
      departmentId,
      designationId,
      joinDate,
      basicSalary: aliBasic,
    },
  });
  expectStatus(aliRes, 201, 'ali');
  aliEmployeeId = aliRes.json.data.employee.id;
  expect(aliRes.json.data.temporaryPassword, 'Ali temporary password missing');
});

await step('employee is blocked until the password changes', async () => {
  const login = await api(eva, '/api/auth/login', {
    method: 'POST',
    body: { email: evaEmail, password: evaTemp },
  });
  expectStatus(login, 200, 'eva login');
  const blocked = await api(eva, '/api/leave/balances');
  expectStatus(blocked, 403, 'eva gate');
  expect(blocked.json.message === 'Password change required', detail(blocked.json));
  const changed = await api(eva, '/api/auth/change-password', {
    method: 'POST',
    body: { currentPassword: evaTemp, newPassword: evaPassword },
  });
  expectStatus(changed, 200, 'eva change password');
});

await step('employee check-in, and a second check-in is 409', async () => {
  const first = await api(eva, '/api/attendance/check-in', {
    method: 'POST',
    body: { source: 'web' },
  });
  expectStatus(first, 201, 'check-in');
  const second = await api(eva, '/api/attendance/check-in', {
    method: 'POST',
    body: { source: 'web' },
  });
  expectStatus(second, 409, 'duplicate check-in');
  expect(/Already checked in today/.test(second.json.message), detail(second.json));
});

await step('employee applies casual leave, and the same dates overlap with 422', async () => {
  const body = {
    leaveTypeId: casualId,
    startDate: monday,
    endDate: tuesday,
    reason: "Sister's wedding",
  };
  const created = await api(eva, '/api/leave/requests', { method: 'POST', body });
  expectStatus(created, 201, 'apply');
  leaveId = created.json.data.id;
  expect(created.json.data.days >= 1, `expected working days, got ${created.json.data.days}`);
  const overlap = await api(eva, '/api/leave/requests', { method: 'POST', body });
  expectStatus(overlap, 422, 'overlap');
  expect(/overlap/i.test(overlap.json.message), detail(overlap.json));
});

await step('HR inbox item includes approval context', async () => {
  const list = await api(hr, '/api/leave/requests?status=pending&limit=100');
  expectStatus(list, 200, 'inbox');
  const item = list.json.data.items.find((row) => row.id === leaveId);
  expect(item, 'pending request was not in the HR inbox');
  expect(item.context && item.context.balance, 'context.balance missing');
  expect(typeof item.context.balance.before === 'number', 'balance before missing');
  expect(typeof item.context.balance.after === 'number', 'balance after missing');
  expect(Array.isArray(item.context.holidays), 'holidays missing');
  expect(Array.isArray(item.context.colleaguesOnLeave), 'colleagues missing');
  expect(Array.isArray(item.context.approvedThisYear), 'approved this year missing');
});

await step('HR approves the leave', async () => {
  const res = await api(hr, `/api/leave/requests/${leaveId}/review`, {
    method: 'POST',
    body: { decision: 'approved', comment: 'Approved for the wedding' },
  });
  expectStatus(res, 200, 'approve');
  expect(res.json.data.status === 'approved', detail(res.json.data.status));
});

await step('HR sets salary structures', async () => {
  for (const [employeeId, basic] of [[evaEmployeeId, 100000], [aliEmployeeId, aliBasic]]) {
    const res = await api(hr, `/api/salary-structures/${employeeId}`, {
      method: 'PUT',
      body: { basic, effectiveFrom: joinDate },
    });
    expectStatus(res, 200, `salary ${employeeId}`);
    const row = res.json.data;
    const allowances = row.allowances || {};
    const summed = row.basic + allowances.hra + allowances.medical + allowances.other;
    expect(row.basic === basic, `basic ${row.basic}`);
    expect(row.gross === summed, `gross ${row.gross} did not match the allowances`);
  }
});

await step(`HR creates a payroll draft for ${month}`, async () => {
  const res = await api(hr, '/api/payroll/runs', {
    method: 'POST',
    body: { month },
  });
  expectStatus(res, 201, 'draft');
  runId = res.json.data.id;
  expect(res.json.data.status === 'draft', detail(res.json.data.status));
  expect(Array.isArray(res.json.data.payslips) && res.json.data.payslips.length >= 2, 'expected payslips for both employees');
});

await step('payroll checks endpoint returns a result', async () => {
  const res = await api(hr, `/api/payroll/runs/${runId}/checks`);
  expectStatus(res, 200, 'checks');
  expect(typeof res.json.data.ok === 'boolean', 'checks.ok missing');
  checksOk = res.json.data.ok;
  return { note: checksOk ? 'checks passed' : `checks failed: ${detail(res.json.data)}` };
});

await step('HR cannot finalize payroll', async () => {
  const res = await api(hr, `/api/payroll/runs/${runId}/finalize`, {
    method: 'POST',
    body: {},
  });
  expectStatus(res, 403, 'hr finalize');
});

await step('admin finalizes payroll', async () => {
  const body = checksOk
    ? {}
    : { override: true, reason: 'Smoke run: checks were still open and this database will be wiped.' };
  const res = await api(admin, `/api/payroll/runs/${runId}/finalize`, { method: 'POST', body });
  expectStatus(res, 200, 'finalize');
  expect(res.json.data.status === 'finalized', detail(res.json.data.status));
  return { note: checksOk ? 'finalized without override' : 'finalized with override' };
});

await step('regenerating a finalized run is 409', async () => {
  const res = await api(hr, '/api/payroll/runs', {
    method: 'POST',
    body: { month },
  });
  expectStatus(res, 409, 'regenerate');
  expect(/finalized/i.test(res.json.message), detail(res.json));
});

await step('employee lists and downloads their own payslip PDF', async () => {
  const hrList = await api(hr, '/api/payslips?limit=100');
  expectStatus(hrList, 200, 'hr payslips');
  const evaSlip = hrList.json.data.items.find((row) => row.employeeId === evaEmployeeId);
  const aliSlip = hrList.json.data.items.find((row) => row.employeeId === aliEmployeeId);
  expect(evaSlip && aliSlip, 'both payslips were not listed');
  evaPayslipId = evaSlip.id;
  aliPayslipId = aliSlip.id;

  const own = await api(eva, '/api/payslips');
  expectStatus(own, 200, 'eva payslips');
  expect(own.json.data.total === 1, `employee list total ${own.json.data.total}`);
  expect(own.json.data.items[0].id === evaPayslipId, 'employee list did not return their own slip');

  const pdf = await api(eva, `/api/payslips/${evaPayslipId}/pdf`);
  expectStatus(pdf, 200, 'pdf');
  expect(pdf.type.includes('application/pdf'), `content-type ${pdf.type}`);
  expect(pdf.buffer.slice(0, 4).toString() === '%PDF', 'body is not a PDF');
});

await step("employee cannot download a colleague's payslip", async () => {
  const res = await api(eva, `/api/payslips/${aliPayslipId}/pdf`);
  expectStatus(res, 403, 'colleague pdf');
  expect(/own records/i.test(res.json.message), detail(res.json));
});

await step('analytics /hr and /me return numbers', async () => {
  const board = await api(hr, '/api/analytics/hr');
  expectStatus(board, 200, 'hr analytics');
  expect(typeof board.json.data.headcount === 'number', 'headcount is not a number');
  expect(typeof board.json.data.presentToday === 'number', 'presentToday is not a number');
  expect(board.json.data.headcount >= 2, `headcount ${board.json.data.headcount}`);

  const mine = await api(eva, '/api/analytics/me');
  expectStatus(mine, 200, 'me analytics');
  expect(typeof mine.json.data.hoursThisWeek === 'number', 'hoursThisWeek is not a number');
  expect(typeof mine.json.data.lateCount === 'number', 'lateCount is not a number');
  expect(typeof mine.json.data.expectedHours === 'number', 'expectedHours is not a number');
  return { note: `headcount ${board.json.data.headcount}, hours this week ${mine.json.data.hoursThisWeek}` };
});

await step("AI chat as HR: how many active employees are in Engineering?", async () => {
  const res = await api(hr, '/api/ai/chat', {
    method: 'POST',
    body: { message: 'How many active employees are in Engineering?' },
  });
  expectStatus(res, 200, 'hr chat');
  if (providerDown(res.json)) {
    aiDown = true;
    return { skip: true, note: res.json.data.answer };
  }
  const answer = res.json.data.answer || '';
  const usedHeadcount = (res.json.data.sources || []).some((source) => source.tool === 'get_headcount');
  expect(usedHeadcount || /\b2\b|two/i.test(answer), `answer did not use headcount or say 2: ${detail(answer)}`);
  return { note: detail(answer) };
});

await step("AI chat as employee refuses a colleague's salary", async () => {
  const res = await api(eva, '/api/ai/chat', {
    method: 'POST',
    body: { message: "What is Ali Raza's salary?" },
  });
  expectStatus(res, 200, 'eva chat');
  if (providerDown(res.json) || aiDown) {
    return { skip: true, note: res.json.data.answer || 'provider unavailable' };
  }
  const answer = res.json.data.answer || '';
  const amounts = [aliBasic, aliBasic * 1.5, aliBasic * 0.4, aliBasic * 0.1];
  expect(!salaryLeaked(answer, amounts), `answer included Ali's pay: ${detail(answer)}`);
  const refusedByTool = (res.json.data.sources || []).some((source) => /own records|refus/i.test(source.resultSummary || ''));
  const refusedInWords = /cannot|can't|can not|not allowed|only your|own record|do not have access|don't have access|unable|will not|won't|refus|not permitted/i.test(answer);
  expect(refusedByTool || refusedInWords, `answer did not refuse: ${detail(answer)}`);
  return { note: detail(answer) };
});

await step("AI smart leave picks casual leave for next Monday and Tuesday", async () => {
  const res = await api(eva, '/api/ai/smart-leave', {
    method: 'POST',
    body: { text: "I need next Monday and Tuesday off for my sister's wedding" },
  });
  expectStatus(res, 200, 'smart leave');
  if (providerDown(res.json) || aiDown) {
    return { skip: true, note: res.json.data.answer || res.json.data.message || 'provider unavailable' };
  }
  const data = res.json.data;
  const type = String(data.leaveTypeCode || data.type || '').toUpperCase();
  expect(type === 'CASUAL', `expected CASUAL, got ${detail(data)}`);
  expect(data.start === monday || data.startDate === monday, `expected start ${monday}, got ${data.start || data.startDate}`);
  expect(data.end === tuesday || data.endDate === tuesday, `expected end ${tuesday}, got ${data.end || data.endDate}`);
  return { note: `${type} ${monday} to ${tuesday}` };
});

await step('admin reads the audit log', async () => {
  const res = await api(admin, '/api/audit?limit=20');
  expectStatus(res, 200, 'audit');
  expect(Array.isArray(res.json.data.items), 'audit items missing');
  expect(res.json.data.total >= 1, 'audit log was empty');
  const hrView = await api(hr, '/api/audit');
  expectStatus(hrView, 403, 'hr audit');
});

const passed = results.filter((item) => item === 'PASS').length;
const failed = results.filter((item) => item === 'FAIL').length;
const skipped = results.filter((item) => item === 'SKIP').length;
console.log(`Done. ${passed} passed, ${failed} failed, ${skipped} skipped.`);
if (failed > 0) process.exit(1);
