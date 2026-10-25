# HCM Lite

HCM Lite is a small human-resources system for one company: Admin sets the rules, HR runs people and payroll, and employees check in, request leave, and read their own payslips. The browser app and the API are separate. The browser only talks to `/api` on its own origin, and the login stays in an httpOnly cookie named `token`. A new database has no employees and no admin until someone finishes the setup screen.

Live app: https://hackathon-starter-frontend-eight.vercel.app

API health: https://hackathon-starter-backend-astm.onrender.com/api/health

Frontend repo: https://github.com/mmuizahmed/hackathon-starter-frontend

This repository is the API. The route contract is [docs/API.md](docs/API.md). The data model is [docs/SCHEMA.md](docs/SCHEMA.md).

## Tech stack

| Piece | Choice | Why |
| --- | --- | --- |
| UI | React 18, Vite, React Router, Tailwind | Role-based pages without a heavy framework. Vite proxies `/api` in local dev. |
| Charts | Recharts | The server computes the numbers. The chart only draws them. |
| UI host | Vercel | Serves the SPA and rewrites `/api` to Render, so the cookie is first-party. |
| API | Node 22, Express 4, plain JavaScript | Easy to read and maintain. Business rules live in services, not in route files. |
| Validation | Zod | Bad input fails before a service runs. |
| Database | MongoDB and Mongoose 8 | Payslip breakdowns and audit snapshots are documents. Judges start from an empty database. |
| Passwords | bcryptjs | Hashes are stored. The hash is `select: false` on the user model. |
| Session | jsonwebtoken in an httpOnly cookie | Page scripts cannot read the token. The JSON body never includes it. |
| PDF | pdfkit | Payslip download is generated from the stored breakdown. |
| Assistant | `fetch` to an OpenAI-compatible chat endpoint | Default model host is Gemini. The key stays on the server. No vendor SDK. |
| API host | Render | `node src/server.js`, health check `/api/health`. |

## Features

### By role

**Admin.** Finish setup, edit company settings, departments, designations, leave types, and holidays. Create HR logins and reset them. Read employees, attendance, leave, and payroll. Finalize a payroll month. Read the audit log. Post announcements. See company analytics. Use the assistant.

**HR.** Register and edit employees, including CSV import and export. Run the attendance board and approve corrections. Approve or reject leave. Save salary structures and build a payroll draft. HR cannot finalize payroll. See the HR dashboard. Post announcements. Use the assistant on HR data.

**Employee.** Change their own phone and address. Web check-in and check-out. See their month calendar and request a correction. Apply for leave, cancel when the rules allow, and read balances. Download their own payslip PDF. See their personal dashboard. Use smart leave and the assistant on their own records. Read announcements aimed at them.

An employee cannot open a colleague's salary, payslip, or leave balance. That check is in the service (`assertOwnEmployee`), including when the assistant calls the same function.

### By module

| Module | Status | What is in this build |
| --- | --- | --- |
| M1 Auth and access | Done | One-time setup, login, logout, me, change password, role guard, temporary-password gate, employee scope |
| M2 Organization | Done | Settings, departments, designations, leave-type quotas, holidays, HR user admin, shared working-day calendar |
| M3 Employees | Done | Register with a one-time temporary password, search, filters, employee 360, exit, CSV dry run and export |
| M4 Attendance | Done for the web | Web check-in and check-out, daily board, month calendar, corrections. See the items below that are not done |
| M5 Leave | Done | Apply, cancel, balances (including `leaveTypeId`), history, HR inbox with context, approve and reject, notifications |
| M6 Payroll | Done | Salary history, draft and regenerate, tax, proration, pre-finalize checks, admin finalize, payslip PDF |
| M7 Dashboards | Done | `GET /api/analytics/admin`, `/hr`, and `/me`. Bonus API: absence anomalies and a rule-based attrition score |
| M8 AI assistant | Done | Chat with tools, KPI summary, smart leave, explain payslip, policy Q&A. Every call is logged |
| M9 Comms and audit | Done | Announcements, in-app notifications, append-only audit log |

Checklist:

- [x] Setup wizard on an empty database
- [x] Admin, HR, and Employee menus
- [x] Web check-in and check-out
- [x] Leave requests and HR approval
- [x] Payroll draft, admin finalize, payslip PDF
- [x] Dashboards computed on the server
- [x] AI assistant with tools and scope checks
- [x] Announcements, notifications, and the audit log
- [ ] Camera check-in. The API can reject a camera body (face count must be 1, GPS accuracy within 100 meters, inside the office radius), but there is no device-camera screen, so this is not a finished feature
- [ ] Mobile APK

## Architecture

```text
Browser (Vercel)
  /api/*  --rewrite-->  Render Express API
                         cookie: token (httpOnly)
                         routes -> controllers -> services -> Mongoose models
                         AI tools call the same services with the signed-in user
```

Production `vercel.json` rewrites `/api/(.*)` to `https://hackathon-starter-backend-astm.onrender.com/api/$1` before the SPA fallback. Locally, the Vite dev server proxies `/api` to `http://localhost:5000`. The UI never puts a token in `localStorage`. It sends `credentials: "include"`.

A request then moves through one route, a thin controller, and a service. The service is where the rule lives. The assistant does not get a database connection. Its tools call those services and pass `req.user`.

Dates that mean a calendar day (`joinDate`, attendance `date`, leave dates) are `YYYY-MM-DD` strings in Asia/Karachi. Check-in times are real timestamps set by the server.

## Run locally

You need Node.js 22 for the API, Node.js 20 or newer for the frontend, and a MongoDB database.

**API (this repo)**

```bash
npm install
cp .env.example .env
```

Edit `.env`. Set `JWT_SECRET` to at least 16 characters. Set `MONGODB_URI` to your database. Set `CLIENT_URL` to `http://localhost:5173`. Leave `ADMIN_EMAIL` and `ADMIN_PASSWORD` empty so the setup screen can run. Leave `AI_API_KEY` empty until you want the assistant.

```bash
npm run dev
```

Health check: `curl http://localhost:5000/api/health`

**Frontend** ([hackathon-starter-frontend](https://github.com/mmuizahmed/hackathon-starter-frontend))

```bash
npm install
npm run dev
```

Open http://localhost:5173. The dev server proxies `/api` to port 5000. Start the API first.

Tests for this API: `npm test`.

## Environment variables

Names and purpose only. Copy from [.env.example](.env.example). Do not commit a filled `.env`.

| Variable | Required | What it does |
| --- | --- | --- |
| `PORT` | No | Port the API listens on. Render sets this. Default in the example is 5000. |
| `NODE_ENV` | No | `development`, `test`, or `production`. |
| `MONGODB_URI` | For real use | MongoDB connection string. Empty starts the process with the database disconnected. |
| `JWT_SECRET` | Yes | Signs the login cookie. At least 16 characters. |
| `CLIENT_URL` | No | Frontend origin for CORS. Local example origin is `http://localhost:5173`. On Render set the Vercel origin. |
| `AI_API_KEY` | No | Server-side assistant key. Empty still boots. |
| `AI_BASE_URL` | No | OpenAI-compatible chat base URL. |
| `AI_MODEL` | No | Model name sent to that endpoint. |
| `AI_RATE_LIMIT` | No | Assistant calls per user per hour. |
| `AI_TIMEOUT_MS` | No | Abort a provider call after this many milliseconds. |
| `ADMIN_EMAIL` | No | With `ADMIN_PASSWORD`, creates the admin once on boot. Leave empty for the setup screen. |
| `ADMIN_PASSWORD` | No | Used only with the boot bootstrap. |
| `COMPANY_NAME` | No | Used only with the boot bootstrap. |

A bad value stops the process with `Configuration error:` before it listens.

## Create the first Admin

Open the app. If the database is empty, the setup wizard is the first screen. Enter the company name, the admin name, the admin email, and a password. That call is `POST /api/setup`. It creates the company settings, the four leave types (Annual 14, Sick 8, Casual 10, Unpaid with no cap), and one admin, then sets the cookie.

It runs once. A second call returns 409. There is no seed data and no demo employee in the repo. HR accounts are created later by Admin under Users. An employee login is created when HR registers that person. The temporary password is shown once and must be changed before the rest of the API will answer.

Leave `ADMIN_EMAIL` unset on Render if judges should use that screen.

## Set the AI key

On the API host (Render, or `.env` locally) set `AI_API_KEY`. Do not put the key in the frontend.

The server calls `{AI_BASE_URL}chat/completions`. If the base URL has no trailing slash, the API adds one so the last path segment is kept. `https://example.com/v1` and `https://example.com/v1/` both call `https://example.com/v1/chat/completions`.

Gemini is the default when those two variables are omitted:

- `AI_BASE_URL` = `https://generativelanguage.googleapis.com/v1beta/openai/`
- `AI_MODEL` = `gemini-2.5-flash`

OpenCode Go is another OpenAI-compatible option:

- `AI_BASE_URL` = `https://opencode.ai/inference/go/openai/v1/`
- `AI_MODEL` = `glm-5.3-flash` (or another model that host serves)

Any other OpenAI-compatible host works the same way: set `AI_BASE_URL` and `AI_MODEL`.

An empty key does not stop boot. Chat then returns a short message that the assistant is not configured, with HTTP 200 and `fallback: true`. The limit is 20 calls per user per hour unless `AI_RATE_LIMIT` is set. The timeout is 15 seconds unless `AI_TIMEOUT_MS` is set.

## Business rules

**Attendance.** One row per employee per Karachi day. A second check-in is 409. Late means strictly after office start plus grace. With 09:00 and 15 minutes, 09:15 is present and 09:16 is late. A day shorter than `halfDayHours` (default 5) is `half_day`. The `late` flag can still be true on that half day. A past day with a check-in and no check-out is shown as `missing_checkout`. A working day on or before today with no row and no approved leave is absent when the board is read. Weekend and holiday punches are stored as `present` with `late: false`, so a short Saturday visit is not a half day. Changing settings does not rewrite old rows.

**Working days.** A day is off when it is in `settings.weekend` (default Saturday and Sunday) or it is a holiday. A tentative holiday still counts. Leave day counts and payroll use `src/services/calendar.service.js`.

**Leave.** The stored `days` is the number of working days in the range. Overlap with the same person's pending or approved request is 422. Balance is the yearly quota minus approved days whose start date is in that calendar year. Pending days are shown and do not reduce `remaining`. Unpaid has a null quota. HR approves or rejects. Reject needs a comment. The owner can cancel a pending request, or an approved one that has not started. Employees read leave types so they can send `leaveTypeId`. Only Admin can create or edit a leave type.

**Payroll.** Gross is basic plus HRA plus medical plus other. If HR does not type allowances, HRA is 40% of basic and medical is 10%, so gross is 1.5 times basic.

Worked example. Basic 100,000. HRA 40,000. Medical 10,000. Gross 150,000. October 2026 has 22 working days when the weekend is Saturday and Sunday and there is no holiday. Per day is 150,000 / 22 = 6,818.18. One absent working day deducts 6,818.18. The payslip still shows the full monthly gross, then the deduction.

Tax uses the monthly structure times 12, not the pay after absence. Annual gross 1,800,000 is in the slab "30,000 plus 15% of the amount above 1,200,000". The amount above 1,200,000 is 600,000. 15% of that is 90,000. Annual tax is 120,000. Monthly tax is 10,000. Net is 150,000 − 6,818.18 − 10,000 = 133,181.82.

Slabs (annual gross):

| Annual gross | Tax |
| --- | --- |
| Up to 600,000 | 0 |
| Above 600,000 up to 1,200,000 | 5% of the amount above 600,000 |
| Above 1,200,000 up to 2,400,000 | 30,000 plus 15% of the amount above 1,200,000 |
| Above 2,400,000 up to 3,600,000 | 210,000 plus 25% of the amount above 2,400,000 |
| Above 3,600,000 | 510,000 plus 35% of the amount above 3,600,000 |

A joiner or leaver is paid for employed working days only. Their tax is the full monthly tax scaled by employed days / working days in the month. Days before they joined are not absences. The salary row that covers the last day of the month is the one that run uses.

The late-penalty setting is off unless Admin turns it on. When it is on, every N late arrivals (default 3) deduct half a day. A stored `half_day` is a separate half-day deduction.

Attendance counts for payroll, dashboards, and the assistant come from `summarizeEmployeeAttendance`. HR can prepare the draft. Only Admin can finalize it. After finalize, regenerate returns 409. Finalize is 422 while checks are open (missing salary, missing check-out, pending leave, pending correction) unless Admin sends `override: true` and a reason.

## Security

- The session cookie is httpOnly, `SameSite=Lax`, path `/`, seven days. `Secure` is set when `NODE_ENV` is production. The login response does not return the token.
- The API reads the cookie only. A role or `mustChangePassword` change applies on the next request because the user row is loaded again.
- Routes use a role check. Employee data uses the employee id, which is not the login id.
- A temporary password can only reach health, setup, login, logout, me, and change password.
- Login is limited to 10 attempts per 15 minutes per IP. The assistant is limited per user per hour.
- Helmet and CORS use `CLIENT_URL`. Production 500 responses say "Internal server error" and do not return a stack.
- Password hashes are not selected on a normal user query and are not written to the audit log. The audit collection refuses updates and deletes.
- `AI_API_KEY` is read on the server and sent only to the model host.

## AI usage declaration

This project was built with AI assistance, which the hackathon brief allows. Cursor agents helped write and review the API, tests, and these notes. The in-app assistant is a separate feature: the server calls the configured model, the model may only use the listed tools, and those tools run the same services as the REST API under the signed-in user.

## Demo credentials

Fill these in after the judges' setup. The repo does not contain them.

| Role | Email | Password | Notes |
| --- | --- | --- | --- |
| Admin | _email from the setup wizard_ | _password from the setup wizard_ | Created once on an empty database |
| HR | _email Admin entered under Users_ | _temporary password shown once, then the new password_ | Blocked until the password is changed |
| Employee | _email HR entered on the employee form_ | _temporary password shown once, then the new password_ | Sees only their own records |

## Smoke script

`scripts/smoke.mjs` walks a fresh API: setup, org data, an HR user, two employees, check-in, leave approval, a payroll draft, finalize, a payslip PDF, analytics, the assistant, and the audit log. It needs `initialized: false`. It will create a company. If you run it against the judges' database, drop that database afterwards so the setup wizard is empty again.

```bash
BASE_URL=http://127.0.0.1:5000 npm run smoke
```

Against the hosted API, set `BASE_URL` to `https://hackathon-starter-backend-astm.onrender.com`. Do that only on a database you are allowed to wipe. The script prints `PASS`, `FAIL`, or `SKIP`. A failed step exits 1. Assistant steps skip when the key is missing or the provider does not answer. They do not fail the run for that reason.

**Warning:** drop or empty the MongoDB database after a smoke run if judges still need to create the first Admin themselves.
