# HCM Lite API

Backend for the Saylani HCM Lite hackathon. Express and MongoDB, plain JavaScript, Node 22. The React app is a separate repo. It proxies `/api/*` to this server, so the login cookie is first-party.

This revision covers company setup, login, organization, employees, attendance, leave, payroll, payslips, announcements, notifications, analytics, and the AI assistant. There is no seed data. A fresh database stays empty until someone finishes setup.

Read these before changing the API:

- [docs/API.md](docs/API.md) — contract for all 9 modules. Implemented routes are marked.
- [docs/PLAN.md](docs/PLAN.md) — what is done per module.
- [docs/BACKEND_GUIDE.md](docs/BACKEND_GUIDE.md) — how a request moves through the code, for the demo and the interview.

## Setup

1. Install [Node.js 22](https://nodejs.org/).
2. Install dependencies:

```bash
npm install
```

3. Create your local env file and edit it:

```bash
cp .env.example .env
```

Set `JWT_SECRET` to at least 16 characters. Leave `ADMIN_EMAIL` and `ADMIN_PASSWORD` empty if you want the setup screen.

4. Start MongoDB, or leave `MONGODB_URI` empty. An empty URI is valid: the API still starts, and `/api/health` reports `db: "disconnected"`. Setup and login need a database.
5. Start the server:

```bash
npm run dev
```

6. Check it:

```bash
curl http://localhost:5000/api/health
curl http://localhost:5000/api/setup/status
```

Create the first admin (only works once):

```bash
curl -i -c cookies.txt -H 'content-type: application/json' \
  -d '{"companyName":"Saylani","adminName":"Ada Admin","adminEmail":"ada@example.com","adminPassword":"correct-horse"}' \
  http://localhost:5000/api/setup
```

The response sets an httpOnly cookie named `token`. It does not return the token in JSON.

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `PORT` | No | `5000` | Port the API listens on. Render sets this. |
| `NODE_ENV` | No | `development` | `development`, `test`, or `production`. |
| `MONGODB_URI` | No | empty | MongoDB connection string. Empty starts without a database. |
| `JWT_SECRET` | Yes | none | Signs the login cookie. At least 16 characters. |
| `CLIENT_URL` | No | `http://localhost:5173` | Frontend origin for CORS. On Render, set the Vercel origin. |
| `AI_API_KEY` | No | empty | Server-side key for the AI assistant. Empty still boots. Never send it to the browser. |
| `AI_BASE_URL` | No | Gemini OpenAI URL | OpenAI-compatible chat completions base. A trailing slash is added if you omit it. |
| `AI_MODEL` | No | `gemini-2.5-flash` | Model name sent to that endpoint. |
| `AI_RATE_LIMIT` | No | `20` | AI requests per user per hour. Over the limit is 429. |
| `AI_TIMEOUT_MS` | No | `15000` | Abort the provider call after this many milliseconds. |
| `ADMIN_EMAIL` | No | empty | With `ADMIN_PASSWORD`, creates the admin once on boot. |
| `ADMIN_PASSWORD` | No | empty | 8 to 72 characters. Leave empty for the setup screen. |
| `COMPANY_NAME` | No | `HCM Lite` when bootstrapping | Used only with the env bootstrap. |

Leave `ADMIN_EMAIL` unset on Render if judges should create the company themselves. If it is set, boot creates the admin and `POST /api/setup` returns 409.

The process checks these values before it listens. A bad value stops startup with `Configuration error:`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the API with `node --watch`. |
| `npm start` | Starts the API once. Use this in production. |
| `npm test` | Health, dates, auth, employees, attendance, leave, payroll, announcements, analytics formulas, AI tools with a mocked provider, and production cookie, proxy, and error checks. |
| `npm run smoke` | End-to-end demo against a server that is already running. Set `BASE_URL`. See below. |

## Response shape

Success:

```json
{ "success": true, "data": {} }
```

Error:

```json
{ "success": false, "message": "What went wrong", "errors": [{ "path": "adminEmail", "message": "Invalid email" }] }
```

`errors` is only present on validation failures. Lists use `?page` and `?limit` (default 1 and 20, max 100) and return `data: { items, total, page, limit }`.

## Deploy on Render

`render.yaml` describes the web service. Build: `npm ci`. Start: `node src/server.js`. Health check: `/api/health`.

Set these on the service:

- `NODE_ENV` = `production`
- `MONGODB_URI` = the Atlas connection string
- `JWT_SECRET` = a long random string (at least 16 characters)
- `CLIENT_URL` = the Vercel origin, such as `https://your-app.vercel.app`
- `AI_API_KEY` = the LLM key. Leave it empty and chat returns a friendly "not configured" message

Do not set `ADMIN_EMAIL` unless you want the admin created on boot. Do not commit `.env`.

`NODE_ENV=production` turns on `trust proxy` (one hop, for Render), the `Secure` cookie flag, and hides error stacks. CORS uses `CLIENT_URL` only. Request bodies over 1 MB are rejected.

## Smoke test

`scripts/smoke.mjs` walks the demo through the HTTP API: setup, org data, an HR login, two employees, the password gate, check-in, leave, payroll, a payslip PDF, analytics, the AI assistant, and the audit log. It uses Node's built-in `fetch` and keeps a cookie jar per role. Each step prints `PASS`, `FAIL`, or `SKIP`. AI steps print `SKIP` when the provider is not configured or cannot be reached. The process exits non-zero if any step fails.

Start the API against the database you want to exercise, then:

```bash
BASE_URL=http://127.0.0.1:5000 npm run smoke
```

`BASE_URL` defaults to `http://127.0.0.1:5000`. The script creates the company, so the database must be empty. It uses a timestamp in every email so a second run on the same database still fails at setup, which is what you want: setup only succeeds once.

Do not point this at the judge database unless you can wipe it afterwards. Drop that database in Atlas so the judges still see the fresh setup screen. A local MongoDB or a throwaway memory server is the right target.

## What is done

- First-run setup, login, logout, current user, change password
- Role check, employee data-scope helper, temporary-password block
- Company settings, departments, designations, leave-type quotas, holidays, and HR logins
- Shared working-day helpers in `src/services/calendar.service.js`
- Employee register, search, employee 360, exit, and CSV import/export
- Attendance check-in and check-out, camera checks, daily board, month calendar, and corrections
- Mongoose models for every collection
- Audit log write helper and admin-only `GET /api/audit`
- Leave requests, salary structures, payroll, payslip PDF, announcements, and notifications
- Analytics at `GET /api/analytics/admin`, `/hr`, `/me`, `/anomalies`, and `/attrition-risk`
- AI chat, dashboard summary, smart leave, payslip explanation, and policy Q&A

Attendance totals for dashboards, payroll, and the AI tools all go through `summarizeEmployeeAttendance`.
