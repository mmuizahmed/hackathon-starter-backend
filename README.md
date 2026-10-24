# HCM Lite API

Backend for the Saylani HCM Lite hackathon. Express and MongoDB, plain JavaScript, Node 22. The React app is a separate repo. It proxies `/api/*` to this server, so the login cookie is first-party.

This revision covers company setup, login, organization settings, employees, and attendance. Leave, payroll, dashboards, and AI are not built yet. There is no seed data. A fresh database stays empty until someone finishes setup.

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
| `AI_API_KEY` | No | empty | Reserved for the AI module. Not used yet. Never send it to the browser. |
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
| `npm test` | Health, Karachi dates, setup, login, password gate, role guard, employee scope, audit, working days, employees, CSV dry run, and attendance. |

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
- `AI_API_KEY` = the LLM key, for the AI module that is not built yet

Do not set `ADMIN_EMAIL` unless you want the admin created on boot. Do not commit `.env`.

## What is done

- First-run setup, login, logout, current user, change password
- Role check, employee data-scope helper, temporary-password block
- Company settings, departments, designations, leave-type quotas, holidays, and HR logins
- Shared working-day helpers in `src/services/calendar.service.js`
- Employee register, search, employee 360, exit, and CSV import/export
- Attendance check-in and check-out, camera checks, daily board, month calendar, and corrections
- Mongoose models for every collection
- Audit log write helper and admin-only `GET /api/audit`

Leave requests, payroll, dashboards, announcements, and AI are specified in `docs/API.md` and not implemented in this revision.
