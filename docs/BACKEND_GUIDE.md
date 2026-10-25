# How this backend works

This is a map of the backend. The code is plain JavaScript. Business rules live in services. Routes do not talk to MongoDB themselves.

## Folder

```text
src/server.js            starts the process and, if the env admin is set, runs setup once
src/app.js               helmet, CORS, JSON, cookie, then the two auth middlewares, then routes
src/routes/              URL to controller
src/controllers/         read the request, call one service, send JSON
src/services/            rules: setup, org, employees, attendance, leave, payroll, analytics, AI, notifications, audit
src/models/              MongoDB collections
src/middleware/          cookie user, password gate, role check, validation, errors
src/utils/timezone.js    Asia/Karachi dates. Use this. Do not parse dates in a route.
src/services/calendar.service.js   isWorkingDay, countWorkingDays, listWorkingDays
```

A new feature should add a route, a thin controller, and a service. The AI tools call those services with the same user that `requireAuth` put on the request.

## Request lifecycle

Example: `POST /api/auth/login`.

1. `server.js` loads `.env`, connects to MongoDB, and listens.
2. `app.js` parses JSON and cookies.
3. `attachUser` looks for a cookie named `token`. Login does not have one yet, so `req.user` is null. This step never returns 401 by itself.
4. `blockIfPasswordChangeRequired` does nothing when nobody is logged in.
5. The router matches `/api/auth/login`.
6. `loginRateLimit` stops the IP after 10 tries in 15 minutes (much higher while tests run).
7. `validateBody` checks the JSON with zod. A bad body is `400` with `errors`.
8. The controller calls `loginUser` in `auth.service.js`.
9. The service loads the user, checks the password, and refuses a deactivated account.
10. The controller signs a JWT and sets the cookie. The body is `{ success: true, data: { user } }`. The token is not in the JSON.
11. Any thrown `AppError` lands in `errorHandler`, which sends `{ success: false, message }`.

Protected routes add `requireAuth` and, when needed, `requireRole('admin')` after the steps above.

## JWT cookie, step by step

1. Setup or login succeeds.
2. `signToken` creates a JWT with `sub` (the user id) and `role`. It expires in 7 days. `JWT_SECRET` signs it.
3. `setAuthCookie` stores it in a cookie named `token`.
   - **httpOnly** so page JavaScript cannot read it. That is safer than `localStorage`.
   - **SameSite=Lax** so other sites cannot post it back to us.
   - **Secure** only when `NODE_ENV` is production (HTTPS on Render).
   - **No Domain attribute.** The Vercel app proxies `/api`, so the browser stores the cookie for the frontend host. It is first-party.
4. The browser sends the cookie on the next `/api` call.
5. `attachUser` verifies the signature, then **loads the user from MongoDB**. The role inside the token is not trusted. If HR deactivates someone, the next request sees `active: false` even though the token is still signed.
6. Logout clears the cookie. We do not keep a session table. A copied cookie still works until it expires. That is the tradeoff of a stateless JWT.

The frontend must not call the Render host from the browser if it wants this cookie. It should call its own `/api` path and let Vercel proxy it. The frontend also cannot read `token` from JavaScript. Use `credentials: 'include'` only if a request is cross-origin. With the proxy, a normal same-origin fetch is enough.

In production the app sets `trust proxy` to 1. Render is that one hop, so the login rate limit sees the browser IP from `X-Forwarded-For` instead of the proxy. CORS allows only `CLIENT_URL`. JSON and form bodies are capped at 1 MB. A 500 response in production is `Internal server error` with no stack. Invalid route ids are rejected as validation errors before Mongo sees them.

## Roles and data scope

Three roles: `admin`, `hr`, `employee`.

`requireRole('admin')` checks `req.user.role` after the database load. HR opening `GET /api/audit` gets `403` and the message `You do not have access to this resource`.

Data scope is separate from the role. An employee id and a user id are different. The user row has `employee`, which points at the employee row. Attendance, leave, and payslips store that employee id.

`src/services/scope.service.js`:

- `employeeScopeFilter(user)` returns `{ employee: user.employeeId }` for an employee, and `{}` for admin or HR (no extra filter).
- Pass a second argument when the id is not stored in a field named `employee`. The employee list uses `employeeScopeFilter(user, '_id')` because that is the employee document's own id.
- If an employee login has no linked profile, the filter is `{ employee: { $in: [] } }`, which matches nothing. A broken login must not see every row.
- `assertOwnEmployee(user, employeeId)` throws `403` `You can only access your own records` when an employee asks for someone else's id.

Attendance, corrections, and the employee list use this helper. Notifications are the exception: they are stored by **user id**, because every login has one, even HR with no employee profile.

## Temporary password

HR will create employee logins with `mustChangePassword: true`. The admin created by setup chose their own password, so the flag is false.

`blockIfPasswordChangeRequired` runs for every request. If the flag is true, the only allowed paths are health, setup, login, logout, me, and change password. Anything else returns `403` and `Password change required`. Change password sets the flag to false. The same cookie keeps working, because the flag is read from the database, not from the token.

## First-run setup

`GET /api/setup/status` is `{ initialized: false }` until a settings row with key `company` exists.

`POST /api/setup` then:

1. Creates that settings row. The unique key stops two setups at once.
2. Inserts four leave types: annual 14, sick 8, casual 10, unpaid with a null quota (unlimited).
3. Creates the admin user with `mustChangePassword: false`.
4. Writes two audit rows: `setup.complete` and `user.create`.
5. Sets the cookie and returns the public user.

A second call returns `409` and `Setup has already been completed`. If a later step fails, the new settings row and leave types are deleted so a retry can run. These leave types are company rules, not sample people. They are not inserted at server start.

Optional env path: if `ADMIN_EMAIL` and `ADMIN_PASSWORD` are both set, `server.js` calls the same `completeSetup` after MongoDB connects. `COMPANY_NAME` defaults to `HCM Lite`. Leave those variables empty in production so the first Admin is created on the setup screen.

## Audit log

`recordAudit({ actorId, action, entity, entityId, before, after })` inserts one row. Call it from the service after a successful change. Do not put `passwordHash` in `before` or `after`.

Login and logout are not audited. Setup, settings, org rows, users, employees, check-in, check-out, and corrections are. The action names are listed in `docs/API.md`. Temporary passwords are not written to the log.

`GET /api/audit` is admin only. Filters: `action`, `entity`, `entityId`, `actor`, `from`, `to`, plus `page` and `limit`.

The model throws if something calls update or delete. There is no such route. Nobody can edit the audit log, including Admin.

## Dates

Store business dates as `YYYY-MM-DD` strings from `src/utils/timezone.js`. Pakistan is UTC+5 all year. A check-in at 00:30 in Karachi must not be saved as the previous UTC date. `checkIn` and `checkOut` are real timestamps. The server sets them. Do not trust a time sent by the browser.

## Working days

`src/services/calendar.service.js` answers three questions for the rest of the app:

- `isWorkingDay('2026-10-27')`
- `countWorkingDays('2026-10-24', '2026-10-27')`
- `listWorkingDays('2026-10-24', '2026-10-27')`

It loads the company weekend and the holidays in that range. A tentative holiday is still a day off. Leave, payroll, and analytics import these functions instead of repeating the rule.

## Check-in

`checkIn` and `checkOut` in `src/services/attendance.service.js` use `new Date()` unless a test passes a clock. The route does not read a time from the body.

One employee, one Karachi day. The second check-in is `409` `Already checked in today`. Late means the timestamp is **after** office start plus grace, so 09:15 is present and 09:16 is late when the office starts at 09:00 and grace is 15 minutes. A checkout shorter than `halfDayHours` becomes `half_day`. The `late` flag stays true if the arrival was late. Those two rules apply on working days only. A weekend or holiday check-in is stored as `present` with `late: false`, so it is not a half-day deduction.

`missing_checkout` and `absent` are decided when a list, board, or calendar is read. Past open rows show `missing_checkout`. A working day on or before today with no row and no approved leave shows `absent`. An approved leave request covering that date shows `on_leave`. Saving settings later does not walk back through old rows and change `late`.

## Camera check-in

The same check-in route accepts `source: "camera"` with `lat`, `lng`, `accuracy`, `faceCount`, a face `descriptor`, and `liveness.blink`. The server rejects a face count other than 1, accuracy worse than 100 meters, or a Haversine distance outside `settings.radiusMeters`. It then checks the enrolled face, described in the next section. The stored row keeps the coordinates, the distance, the match score, and `liveness: true`. It does not keep a photo or the descriptor. A rejected camera call does not insert a row. Camera check-out uses those same checks and does not change `source`.

## Face matching

Camera check-in compares the person in front of the camera with the face that employee enrolled earlier. The browser (a separate app) runs `@vladmandic/human` and sends a descriptor: a list of numbers, usually 1024 long, from the `faceres` model. This API never receives a photo and never stores one.

Enrollment is `POST /api/face/enroll`. The numbers are saved on the employee as `faceDescriptor`. That field is hidden from normal queries (`select: false`). Responses only say whether a face is enrolled (`faceEnrolled` on employee objects, and `enrolled`, `enrolledAt`, and `model` on `GET /api/face/me`). An employee cannot replace an enrolled face. HR or an admin clears it with `DELETE /api/face/:employeeId`.

On a camera punch the server also requires a blink (`liveness.blink` must be true). That is a simple liveness check. It is not a full anti-spoofing system. The server then scores the live descriptor against the stored one in `src/utils/faceMatch.js`. The math is the Human library's Euclidean match (order 2, default multiplier 25, result from 0 to 1), so a score on the server matches a score the page computed. Below `FACE_MATCH_THRESHOLD` (default 0.55) the punch is refused and nothing is written.

The attendance row stores `faceMatchScore` (two decimal places) and `liveness: true`. It does not store the descriptor. Audit rows for enroll and reset record the model and the time, not the numbers. Assistant tools and prompts are not given the descriptor either. They may say that a face is enrolled. They must not repeat the numbers.

## Analytics

`src/services/analytics.service.js` is the company, HR, and personal dashboard. Routes are `GET /api/analytics/admin`, `/hr`, and `/me`. The planned names were `/api/dashboards/*`.

Attendance totals call `summarizeEmployeeAttendance`. That is the same function payroll uses, so the three screens cannot disagree about a late half day or a missing check-out. Leave utilization calls `listLeaveRequests` and `listLeaveTypes`. Payroll cost calls `listPayslips`. The personal card calls `getLeaveBalances` and `listPayslips`.

`src/services/insights.service.js` is the bonus. Bradford Factor and the Monday/Friday and holiday-adjacent flags need the order of days, so they use `loadClassifiedDays`. The attrition-risk score is a fixed point list. It is not a trained model. Its late rate and unpaid days still come from `getAttendanceSummary`.

## AI assistant

`POST /api/ai/chat` is the only place the model runs. The browser never sees `AI_API_KEY`.

1. `guardedAi` counts this user's `aiLogs` rows in the last hour. At the limit it returns 429 `Too many AI requests. Try again in an hour.` and still writes a log row.
2. `chat` sends the system prompt (policy rules plus live settings and leave types) and the user's messages to an OpenAI-compatible chat completions endpoint. The default base URL is Gemini.
3. If the model returns `tool_calls`, `runTool` runs at most four of them. Each tool calls a service that already exists: headcount, attendance summary, late comers, leave summary, leave balances, payroll summary, or employee search. The user object is the one from the cookie.
4. If the arguments include `employeeId`, `assertOwnEmployee` runs first. A refusal becomes `{ refused: true, message }` and is appended as a tool message. The hidden salary is not loaded.
5. The model may do this for 3 rounds. Then one last completion runs with tools turned off.
6. The JSON answer adds `sources` (tool name, args, a short result summary), `tools`, `aiGenerated: true`, and `label: "AI-generated"`.
7. `writeAiLog` stores the feature, the user text, the tool names, the answer, and how long it took.

`POST /api/ai/smart-leave` asks for JSON, checks it with zod against the live leave-type codes, retries once, and returns `fallback: true` if it still fails. It does not insert a `LeaveRequest`. `POST /api/ai/explain-payslip` calls `getPayslip` before the model sees the slip. `POST /api/ai/summary` may only talk about the `kpis` object in the body. `POST /api/ai/policy` uses the same written rules as the chat prompt.

A timeout, a provider error, or a missing key is HTTP 200 with a short fallback sentence. `403` and `429` stay errors.

## Leave and payroll

Leave and pay share one calendar: `src/services/calendar.service.js`. A working day is not in `settings.weekend` and not in the holidays collection. Tentative holidays still count. Dates are `YYYY-MM-DD` in Asia/Karachi.

### Leave

`applyLeave` counts working days and stores that number. Overlap means this employee already has a pending or approved request on any of those calendar dates. The balance is the yearly quota minus approved `days` whose start date is in that year. Pending is shown beside it and does not reduce `remaining`. Unpaid leave has a null quota, so it never fails the balance check. On approve, the same overlap and balance checks run again. Reject requires a comment. The owner can cancel a pending request, or an approved one that has not started.

The HR inbox adds `context` so the approver can see the effect: balance before this request and after it, holidays inside the dates, other people in the same department who are already approved on those dates, and this employee's approved leave that started this year. Employees do not receive that block, because it names colleagues.

### A worked payroll example

Eva's basic is 100,000. HR did not type allowances, so HRA is 40% (40,000) and medical is 10% (10,000). Other allowances are 0. Gross for a full month is 150,000.

October 2026 has 22 working days when the weekend is Saturday and Sunday and there is no holiday. Per day is 150,000 / 22 = 6,818.18. The payslip keeps the full gross. It does not shrink the gross just because 6,818.18 × 22 is a few paisa under 150,000. The deduction uses the rounded per-day rate.

Eva is absent one working day and present the rest. The absent line is `{ days: 1, perDay: 6818.18, amount: 6818.18 }`. Nothing else is deducted.

Tax uses the monthly structure, not the pay after absence. Annual gross is 150,000 × 12 = 1,800,000. That is inside "30,000 plus 15% of the amount above 1,200,000". The amount above 1,200,000 is 600,000. 15% of that is 90,000. Annual tax is 30,000 + 90,000 = 120,000. Monthly tax is 120,000 / 12 = 10,000. One absent day does not move her into a lower slab.

Net pay is 150,000 − 6,818.18 − 10,000 = 133,181.82.

If the late-penalty setting is on and the rule is 3 lates = half a day, three late arrivals add another 0.5 × 6,818.18. A stored `half_day` adds the same half-day amount on its own. A late half day can count for both, because one rule is about hours worked and the other is about how often she arrived late.

### A joiner

Ali joins on 15 October 2026. October still has 22 working days, but he is employed for 12 of them. His gross on the payslip is 6,818.18 × 12 = 81,818.16. His tax is still calculated from the 150,000 structure (10,000 for a full month) and then scaled by 12/22, which is 5,454.55. Days before he joined are not absences. The structure that covers 31 October is the one this run uses, so a raise dated 1 November does not change October when HR regenerates the draft.

### Finalize

HR can build the draft while data is still messy. `GET /api/payroll/runs/:id/checks` lists four problems: no salary structure covering the month end, a missing check-out, pending leave that overlaps the month, and a pending attendance correction in the month. Admin finalize returns `422` until those lists are empty. Admin can send `override: true` and a reason. That reason is the audit `after.reason`. HR cannot finalize (`403`). After `finalized`, regenerate returns `409`. Each payslip then notifies that employee's login.

`summarizeEmployeeAttendance(employeeId, from, to)` is the attendance count used above, and the one analytics and the AI attendance tools use. It follows the attendance board: a stored row wins, approved leave covers a day with no row, and a day after today is not an absence yet.
