# HCM Lite API

Backend for HCM Lite, an HR system for one company. Admin sets the rules, HR manages people, attendance, leave and payroll, and employees check in, apply for leave and download their payslips. An AI assistant answers questions from live company data.

| | |
| --- | --- |
| Live app | https://hcm.muiz.pk |
| API health | https://hackathon-starter-backend-astm.onrender.com/api/health |
| Android APK | [HCM-Lite.apk](https://github.com/mmuizahmed/hcm-lite-frontend/releases/download/apk-latest/HCM-Lite.apk) |
| Frontend repo | https://github.com/mmuizahmed/hcm-lite-frontend |

More detail: [API reference](docs/API.md), [data model](docs/SCHEMA.md), [how the code is organised](docs/BACKEND_GUIDE.md).

## Tech stack

| Part | Choice |
| --- | --- |
| Runtime | Node.js 22, Express 4, plain JavaScript (ES modules) |
| Database | MongoDB with Mongoose 8 |
| Validation | Zod |
| Auth | JWT in an httpOnly cookie, bcrypt password hashes |
| PDF | pdfkit (payslips) |
| AI | Any OpenAI-compatible chat API, Gemini by default, called with `fetch` |
| Tests | Node's built-in test runner with an in-memory MongoDB |
| Hosting | Render |

## Features

**Admin.** Company settings, departments, designations, leave types and holidays. Creates HR logins and can deactivate or reset any login. Finalizes payroll. Reads the audit log. Company dashboard with headcount, attrition, payroll cost, gender and tenure.

**HR.** Registers employees (also by CSV import with a dry run) and exports the directory. Runs the daily attendance board, approves corrections and leave, saves salary structures and prepares the payroll draft. HR dashboard with attendance trend, absenteeism, leave by type, late arrivals, absence flags and attrition risk.

**Employee.** Web or camera check-in, month calendar, correction requests, leave applications and balances, payslip PDF, own profile and dashboard.

**Everyone.** Announcements, in-app notifications and the AI assistant. The assistant uses tools (`get_headcount`, `get_attendance_summary`, `get_late_comers`, `get_leave_summary`, `get_my_leave_balance`, `get_payroll_summary`, `search_employees`) that call the same services as the REST API, so it sees only what the signed-in user may see. It also summarizes dashboards, fills the leave form from a sentence, explains a payslip, and answers policy questions in English, Urdu or Roman Urdu.

**Camera check-in.** The phone sends a face descriptor (numbers, never a photo), a blink result and GPS. The server checks one face, GPS accuracy within 100 m, distance from the office, and a match against the enrolled face.

## Done and not done

Done: all nine modules (auth, organization, employees, attendance, leave, payroll, dashboards, AI assistant, announcements and audit), camera check-in, late penalty, absence anomalies, attrition risk, and the Android APK.

Not done:

- No offline mode. The web app can be installed to the home screen but needs a connection.
- Notifications are polled every 60 seconds, not pushed.
- The APK is a debug build, not signed for the Play Store.
- There is no sample data. A new install starts from the setup screen on purpose.

## Run locally

Needs Node.js 22 and a MongoDB database (local or Atlas).

```bash
npm install
cp .env.example .env    # then set MONGODB_URI and JWT_SECRET
npm run dev             # http://localhost:5000
```

Check it with `curl http://localhost:5000/api/health`. Then start the [frontend](https://github.com/mmuizahmed/hcm-lite-frontend), which proxies `/api` to port 5000, and open http://localhost:5173.

Run the tests with `npm test`.

## Create the first Admin

On an empty database the app opens the setup screen. Enter the company name, the Admin's name, email and password, and the office rules. This calls `POST /api/setup`, which creates the settings, four leave types (Annual 14, Sick 8, Casual 10, Unpaid) and the Admin account, then signs the Admin in.

Setup runs once. A second call returns 409. Admin then creates HR logins under Users, and HR creates employee logins when registering employees. A temporary password is shown once and must be changed at first sign-in.

## Set the AI key

Set `AI_API_KEY` on the server (Render, or `.env` locally). It is never sent to the browser.

Without `AI_BASE_URL` and `AI_MODEL`, the API uses Gemini (`https://generativelanguage.googleapis.com/v1beta/openai/`, model `gemini-3.5-flash`). Any OpenAI-compatible provider works by setting those two variables.

With no key the API still runs. AI features then return a short "not configured" message. Each user gets 20 AI calls per hour, each call times out after 15 seconds, and every call is saved in the `aiLogs` collection.

## Environment variables

Names and purpose only. Copy from [.env.example](.env.example). Do not commit a filled `.env`.

| Variable | Required | What it does |
| --- | --- | --- |
| `PORT` | No | Port the API listens on. Render sets this. Default in the example is 5000. |
| `NODE_ENV` | No | `development`, `test`, or `production`. |
| `MONGODB_URI` | For real use | MongoDB connection string. Empty starts the process with the database disconnected. |
| `JWT_SECRET` | Yes | Signs the login cookie. At least 16 characters. |
| `CLIENT_URL` | No | Frontend origin for CORS. Locally `http://localhost:5173`. In production, the frontend origin. |
| `AI_API_KEY` | No | Server-side assistant key. Empty still boots. |
| `AI_BASE_URL` | No | OpenAI-compatible chat base URL. |
| `AI_MODEL` | No | Model name sent to that endpoint. |
| `AI_RATE_LIMIT` | No | Assistant calls per user per hour. |
| `AI_TIMEOUT_MS` | No | Abort a provider call after this many milliseconds. |
| `FACE_MATCH_THRESHOLD` | No | Minimum face similarity for a camera punch, from 0 to 1. Default `0.55`. Same scale as Human `match.similarity`. |
| `ADMIN_EMAIL` | No | With `ADMIN_PASSWORD`, creates the admin once on boot. Leave empty to use the setup screen. |
| `ADMIN_PASSWORD` | No | Used only with the boot bootstrap. |
| `COMPANY_NAME` | No | Used only with the boot bootstrap. |

A bad value stops the process with `Configuration error:` before it listens.

## Architecture

```text
Browser ── /api/* ──> Vercel rewrite ──> Express API on Render ──> MongoDB Atlas
                                         routes → controllers → services → models
```

Because Vercel forwards `/api` to Render, the browser treats the API as same-origin and the login cookie stays first-party. Business rules live only in `src/services/`. Dashboards and AI tools call those same functions.

Calendar dates (join date, attendance day, leave dates) are `YYYY-MM-DD` strings in Asia/Karachi time.

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

## Smoke test

`scripts/smoke.mjs` runs a full flow against a fresh API: setup, organization data, an HR user, employees, check-in, leave approval, payroll, a payslip PDF, dashboards, the assistant and the audit log. It needs an empty database and creates real data, so only run it on a database you can wipe afterwards.

```bash
BASE_URL=http://127.0.0.1:5000 npm run smoke
```
