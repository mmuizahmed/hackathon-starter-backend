# HCM Lite API contract

Base path: `/api`.

The frontend is on Vercel and proxies `/api/*` to this server. Call the frontend origin, not the Render host, so the `token` cookie stays first-party. The cookie is httpOnly. JavaScript cannot read it. Do not expect a token in JSON.

This file is the contract for all 9 modules. **Implemented** means this revision serves the route. **Planned** means the shape is agreed and the code is not written yet. Do not rename a path without updating this file.

## Envelope

Success:

```json
{ "success": true, "data": {} }
```

Error:

```json
{ "success": false, "message": "What went wrong" }
```

Validation errors add `errors`:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [{ "path": "adminEmail", "message": "Invalid email address" }]
}
```

Lists accept `?page` (default 1) and `?limit` (default 20, max 100):

```json
{ "success": true, "data": { "items": [], "total": 0, "page": 1, "limit": 20 } }
```

Ids in JSON are strings named `id`. Dates that are a calendar day (`joinDate`, attendance `date`, leave dates, holidays) are `YYYY-MM-DD` in Asia/Karachi. `checkIn`, `checkOut`, and audit `timestamp` are ISO timestamps. The server stamps check-in and check-out. Ignore a time sent by the client.

Passwords are 8 to 72 characters. bcrypt only uses the first 72 bytes.

| Status | When |
| --- | --- |
| 400 | Validation, or the current password is wrong on change-password |
| 401 | Missing or bad cookie, or wrong login password. Message: `Authentication required` or `Invalid email or password` |
| 403 | `Account is deactivated`, `Password change required`, `You do not have access to this resource`, `You can only access your own records`, `You can only change your phone and address` |
| 409 | Setup already done, `Already checked in today`, a duplicate unique field, deleting a department, designation, or leave type that is still in use, a leave request that was already reviewed, or any edit of a finalized payroll run |
| 422 | Camera check-in rejected, leave overlap, not enough leave balance, a range with no working days, or payroll checks that failed |
| 429 | Login rate limit. Message: `Too many login attempts. Try again later.` |

Login allows 10 attempts per 15 minutes per IP.

While `mustChangePassword` is true, the only paths that answer are:

- `GET /api/health`
- `GET /api/setup/status`
- `POST /api/setup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/change-password`

Every other path returns 403 `Password change required`.

Public user:

```json
{
  "id": "…",
  "name": "Ada Admin",
  "email": "ada@example.com",
  "role": "admin",
  "mustChangePassword": false,
  "employeeId": null
}
```

`role` is `admin`, `hr`, or `employee`. `employeeId` is null for a login that is not linked to an employee.

## Implemented in this revision

Auth, organization, employees, attendance, leave, payroll, payslips, announcements, notifications, analytics, and AI.

| Method | Path | Who |
| --- | --- | --- |
| GET | `/api/health` | Public |
| GET | `/api/setup/status` | Public |
| POST | `/api/setup` | Public, once |
| POST | `/api/auth/login` | Public |
| POST | `/api/auth/logout` | Public |
| GET | `/api/auth/me` | Any logged-in user |
| POST | `/api/auth/change-password` | Any logged-in user |
| GET | `/api/settings` | Admin, HR |
| PUT, PATCH | `/api/settings` | Admin |
| GET, POST, PATCH, DELETE | `/api/departments` | GET: admin, HR. Writes: admin |
| GET, POST, PATCH, DELETE | `/api/designations` | GET: admin, HR. Writes: admin |
| GET, POST, PATCH, DELETE | `/api/leave-types` | GET: admin, HR. Writes: admin |
| GET, POST, PATCH, DELETE | `/api/holidays` | GET: admin, HR. Writes: admin |
| GET, POST, PATCH | `/api/users` | Admin |
| GET, POST | `/api/employees` | GET: admin, HR, employee. POST: HR |
| GET | `/api/employees/:id` | Admin, HR, employee (own) |
| PATCH | `/api/employees/:id` | HR, employee (own phone and address) |
| POST | `/api/employees/import` | HR |
| GET | `/api/employees/export` | HR |
| POST | `/api/attendance/check-in` | HR, employee |
| POST | `/api/attendance/check-out` | HR, employee |
| GET | `/api/attendance` | Admin, HR, employee (own) |
| GET | `/api/attendance/board` | Admin, HR |
| GET | `/api/attendance/calendar` | Admin, HR, employee (own) |
| GET, POST | `/api/attendance/corrections` | GET: all three roles. POST: HR, employee |
| POST | `/api/attendance/corrections/:id/review` | HR |
| GET | `/api/audit` | Admin |
| GET | `/api/leave/balances` | Own, or admin/HR with `employeeId` |
| GET | `/api/leave/requests` | Admin and HR: all. Employee: own |
| POST | `/api/leave/requests` | Employee, or HR with an employee profile |
| POST | `/api/leave/requests/:id/cancel` | The owner |
| POST | `/api/leave/requests/:id/review` | HR |
| GET | `/api/salary-structures` | Admin, HR |
| PUT | `/api/salary-structures/:employeeId` | HR |
| POST | `/api/payroll/runs` | HR |
| GET | `/api/payroll/runs` | Admin, HR |
| GET | `/api/payroll/runs/:id` | Admin, HR |
| GET | `/api/payroll/runs/:id/checks` | Admin, HR |
| POST | `/api/payroll/runs/:id/finalize` | Admin |
| GET | `/api/payslips` | Admin and HR: all. Employee: own |
| GET | `/api/payslips/:id` | Same scope |
| GET | `/api/payslips/:id/pdf` | Same scope. `application/pdf` |
| GET | `/api/announcements` | Any logged-in user |
| POST | `/api/announcements` | Admin, HR |
| PATCH | `/api/announcements/:id` | Admin, HR |
| GET | `/api/notifications` | Own |
| GET | `/api/notifications/unread-count` | Own |
| POST | `/api/notifications/:id/read` | Own |
| POST | `/api/notifications/read-all` | Own |
| GET | `/api/analytics/admin` | Admin |
| GET | `/api/analytics/hr` | Admin, HR |
| GET | `/api/analytics/me` | Any logged-in user with an employee profile |
| GET | `/api/analytics/anomalies` | Admin, HR |
| GET | `/api/analytics/attrition-risk` | Admin, HR |
| POST | `/api/ai/chat` | Any logged-in user, scoped |
| POST | `/api/ai/summary` | Admin, HR |
| POST | `/api/ai/smart-leave` | HR, employee |
| POST | `/api/ai/explain-payslip` | Any logged-in user, scoped |
| POST | `/api/ai/policy` | Any logged-in user |

### Contract notes for leave and payroll

- Leave balance items add `pending`. Pending does not reduce `remaining`. `GET /api/leave/balances` returns `{ year, employeeId, items }`.
- The owner can cancel while the request is `pending`, or while it is `approved` and `startDate` is after today in Asia/Karachi.
- Rejecting leave requires `comment`.
- HR and admin leave rows include `context` (balance before and after, holidays in the range, colleagues in the same department who already have approved leave on those dates, and this employee's approved leave that starts in the same year). Employee responses omit `context`.
- Salary `allowances` may be omitted. The server then stores HRA at 40% of basic, medical at 10%, and other at 0.
- `POST /api/payroll/runs` creates the month or regenerates the draft. A finalized month is `409`.
- `GET /api/payroll/runs/:id/checks` is the pre-finalize list. Finalize is `422` until those lists are empty, unless the body is `{ "override": true, "reason": "..." }`. The reason is stored on the audit row.
- Payslip `breakdown` keeps the keys below and adds `lines`. Each deduction line has the inputs, for example `{ "label": "Absent deduction", "days": 1, "perDay": 6818.18, "amount": 6818.18 }`.
- For a full month, top-level `gross` is the monthly structure. For a joiner or leaver it is the prorated gross actually paid. `inputs.grossMonthly` is always the full structure.
- The structure that covers the last day of the month is the one payroll uses. A raise dated next month does not change this month's draft.
- `GET /api/notifications` adds `unreadCount`. `GET /api/notifications/unread-count` returns `{ "count": 0 }`.

## Role rules

Section 2 lets admin **read** employees, attendance, leave, and payroll. Section 8 still blocks some **actions**. Where those differ, this table wins:

| Action | Admin | HR | Employee |
| --- | --- | --- | --- |
| Setup | Yes | No | No |
| Settings, departments, designations, leave types, holidays | Manage | View | No |
| Create HR login, deactivate, reset password | Yes | No | No |
| Register or edit an employee | View | Manage | Own phone and address |
| Directory and employee 360 | All | All | Own |
| CSV import and export | No | Yes | No |
| Web check-in and check-out | No | Own, if they have an employee id | Own |
| Attendance daily board | Yes | Yes | No |
| Attendance month calendar | Any employee | Any employee | Own |
| Attendance correction | View | Approve | Request own |
| Apply, cancel, balance | View records | Own, and view all requests | Own |
| Approve leave | View | Approve | No |
| Salary structure | View | Manage | No |
| Payroll draft | View | Manage | No |
| Finalize payroll | Yes | No | No |
| Payslips | All | All | Own |
| Analytics | Company | HR | Personal (`/api/analytics/me`) |
| AI chat | All data | HR data | Own data |
| AI summary | Yes | Yes | No |
| Smart leave | No | Own | Own |
| Explain payslip | Any slip | Any slip | Own slip |
| Policy Q&A | Yes | Yes | Yes |
| Absence anomalies, attrition risk | Yes | Yes | No |
| Announcements | Post | Post | Read |
| Notifications | Own | Own | Own |
| Audit log | View | No | No |

Employee data queries must use `employeeScopeFilter` or `assertOwnEmployee` from `src/services/scope.service.js`. Compare the **employee** id. The login id is different. Notifications filter on `user` (the login id).

## M1 Auth and access

### GET `/api/health` — implemented

No cookie.

```json
{ "success": true, "data": { "status": "ok", "uptime": 3, "db": "connected" } }
```

`db` is `connected` or `disconnected`.

### GET `/api/setup/status` — implemented

```json
{ "success": true, "data": { "initialized": false } }
```

`initialized` is true after the settings row exists.

### POST `/api/setup` — implemented

Runs once. Creates settings, the four leave types, and the admin. Sets the `token` cookie. Returns 201.

```json
{
  "companyName": "Saylani",
  "adminName": "Ada Admin",
  "adminEmail": "ada@example.com",
  "adminPassword": "correct-horse",
  "settings": {
    "officeStart": "09:00",
    "graceMinutes": 15,
    "halfDayHours": 5,
    "weekend": ["Sat", "Sun"],
    "officeLat": 24.86,
    "officeLng": 67.01,
    "radiusMeters": 150
  }
}
```

`settings` is optional. Omitted fields use the defaults above. `officeLat` and `officeLng` must be sent together or not at all. If omitted they are stored as null. `latePenalty` is not part of this body. It starts as `{ "enabled": false, "latesPerHalfDay": 3 }`.

Weekend values: `Sun`, `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`.

Response `data.user` is the public user. Admin `mustChangePassword` is false.

`409` if setup already ran: `Setup has already been completed`.

If `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set on the server, boot calls this same logic. The setup screen should hide itself when `initialized` is true.

Leave types created here, and only here, until an admin adds more:

| code | name | yearlyQuota | paid |
| --- | --- | --- | --- |
| ANNUAL | Annual | 14 | true |
| SICK | Sick | 8 | true |
| CASUAL | Casual | 10 | true |
| UNPAID | Unpaid | null | false |

`yearlyQuota: null` means unlimited.

### POST `/api/auth/login` — implemented

```json
{ "email": "ada@example.com", "password": "correct-horse" }
```

Sets the cookie. `data.user` is the public user. Wrong email or password: `401` `Invalid email or password` (same text for both). Right password but `active: false`: `403` `Account is deactivated`, and no cookie.

### POST `/api/auth/logout` — implemented

Clears the cookie.

```json
{ "success": true, "data": { "loggedOut": true } }
```

### GET `/api/auth/me` — implemented

Needs the cookie.

```json
{ "success": true, "data": { "user": { "id": "…", "name": "…", "email": "…", "role": "admin", "mustChangePassword": false, "employeeId": null } } }
```

### POST `/api/auth/change-password` — implemented

```json
{ "currentPassword": "temp-pass-1", "newPassword": "new-pass-123" }
```

Clears `mustChangePassword`. Returns `data.user`. Wrong current password: `400` `Current password is incorrect`.

## M2 Organization — implemented

Settings rules apply to **new** attendance, leave, and payroll records. Changing settings does not rewrite the status already stored on old attendance rows.

`src/services/calendar.service.js` is the shared working-day API. Leave, payroll, and dashboards should import these three functions and not copy the weekend or holiday check:

- `isWorkingDay(dateStr)` returns a boolean.
- `countWorkingDays(startStr, endStr)` returns a number.
- `listWorkingDays(startStr, endStr)` returns `YYYY-MM-DD` strings.

A day is not a working day when it is in `settings.weekend` or it is a holiday. Tentative holidays count. An empty weekend list means there is no weekend. `start` after `end` returns `[]` or `0`. Dates must be `YYYY-MM-DD`.

Settings JSON:

```json
{
  "id": "…",
  "companyName": "Saylani",
  "officeStart": "09:00",
  "graceMinutes": 15,
  "halfDayHours": 5,
  "weekend": ["Sat", "Sun"],
  "officeLat": null,
  "officeLng": null,
  "radiusMeters": 150,
  "latePenalty": { "enabled": false, "latesPerHalfDay": 3 }
}
```

| Method | Path | Who | Body |
| --- | --- | --- | --- |
| GET | `/api/settings` | Admin, HR | |
| PUT | `/api/settings` | Admin | Any of the fields above except `id`. At least one field. |
| PATCH | `/api/settings` | Admin | Same handler as PUT. PUT is the contract. |

`officeLat` and `officeLng` must be sent together. The write is audited as `settings.update`. HR who calls PUT or PATCH gets `403` `You do not have access to this resource`.

| Method | Path | Who | Body |
| --- | --- | --- | --- |
| GET | `/api/departments` | Admin, HR | Paged list. `?active=true` or `active=false` |
| POST | `/api/departments` | Admin | `{ "name": "Engineering" }` |
| PATCH | `/api/departments/:id` | Admin | `{ "name": "Engineering", "active": true }` |
| DELETE | `/api/departments/:id` | Admin | |
| GET | `/api/designations` | Admin, HR | Paged list. Same `active` filter |
| POST | `/api/designations` | Admin | `{ "name": "Engineer" }` |
| PATCH | `/api/designations/:id` | Admin | `{ "name": "Engineer", "active": true }` |
| DELETE | `/api/designations/:id` | Admin | |

Department and designation item: `{ id, name, active, createdAt, updatedAt }`. Names are unique. A duplicate name is `409`.

Delete returns `{ "deleted": true }`. Delete is `409` when an employee still points at the row: `Department is assigned to employees` or `Designation is assigned to employees`.

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/api/leave-types` | Admin, HR | Paged list |
| POST | `/api/leave-types` | Admin | `{ name, code, yearlyQuota, paid }`. `yearlyQuota` null means unlimited |
| PATCH | `/api/leave-types/:id` | Admin | Same fields plus `active`. This is how a quota is edited |
| DELETE | `/api/leave-types/:id` | Admin | `409` `Leave type is used by leave requests` when a request still points at it |
| GET | `/api/holidays` | Admin, HR | `?year=2026` optional. Paged |
| POST | `/api/holidays` | Admin | `{ date, name, tentative }` |
| PATCH | `/api/holidays/:id` | Admin | Same fields |
| DELETE | `/api/holidays/:id` | Admin | Mistyped holidays. Audited |

`tentative: true` is a moon-sighting holiday. It still counts as a holiday until someone edits it.

Holiday item: `{ id, date, name, tentative, createdAt, updatedAt }`. Leave type item: `{ id, name, code, yearlyQuota, paid, active, createdAt, updatedAt }`.

Creates return 201. Every create, update, and delete writes an audit row. Password hashes are never in the snapshot.

### Users — implemented

Admin only. This creates **HR** logins. Employee logins are created by `POST /api/employees`. This route does not create another admin.

| Method | Path | Body / query |
| --- | --- | --- |
| GET | `/api/users` | `?role&active&page&limit` |
| POST | `/api/users` | `{ name, email, password, role? }` |
| PATCH | `/api/users/:id` | `{ active?: boolean, resetPassword?: boolean }` |

`role` may be omitted or `hr`. `role: "admin"` is `400` `Admin users cannot be created through the API`. `role: "employee"` is `400` `Create employees with POST /api/employees`. The saved role is always `hr`, `mustChangePassword` is true, and the response is `{ user, temporaryPassword }` where `temporaryPassword` is the password that was sent. It is returned once.

`resetPassword: true` generates a new temporary password, sets `mustChangePassword` true, and returns `temporaryPassword` once. `active: false` deactivates the login. `active: true` turns it back on. An admin cannot deactivate their own login: `400` `You cannot deactivate your own login`. Do not return `passwordHash`.

User list item is the public user plus `active`.

## M3 Employees — implemented

Employee JSON:

```json
{
  "id": "…",
  "code": "E-001",
  "name": "Eva",
  "email": "eva@example.com",
  "phone": "",
  "address": "",
  "department": { "id": "…", "name": "Engineering" },
  "designation": { "id": "…", "name": "Engineer" },
  "joinDate": "2026-10-01",
  "exitDate": null,
  "status": "active",
  "gender": "female",
  "salary": { "basic": 100000 },
  "userId": "…"
}
```

`status`: `active`, `probation`, or `exited`. `gender`: `male`, `female`, `other`, `undisclosed`. `salary.basic` must be greater than 0. Headcount counts `active` and `probation`.

| Method | Path | Who |
| --- | --- | --- |
| GET | `/api/employees` | Admin and HR: all. Employee: only their row. Query `search`, `departmentId`, `designationId`, `status`, `page`, `limit` |
| POST | `/api/employees` | HR |
| GET | `/api/employees/:id` | Employee 360. Admin and HR: any. Employee: own, else 403 `You can only access your own records` |
| PATCH | `/api/employees/:id` | HR: all editable fields. Employee: `phone` and `address` only, else 403 `You can only change your phone and address`. Admin: 403 |
| POST | `/api/employees/import` | HR. Multipart field `file`, or JSON `{ "csv": "..." }`. See dry run below |
| GET | `/api/employees/export` | HR. `text/csv`. Honors the same filters as the list. No JSON envelope |

`POST /api/employees` body:

```json
{
  "code": "E-001",
  "name": "Eva",
  "email": "eva@example.com",
  "phone": "",
  "address": "",
  "departmentId": "…",
  "designationId": "…",
  "joinDate": "2026-10-01",
  "status": "active",
  "gender": "female",
  "basicSalary": 100000
}
```

This creates the employee and a user with the same email, role `employee`, `mustChangePassword: true`, and a temporary password. Response is `201` and includes `employee` and `temporaryPassword` once so HR can hand the password over. It is not stored in the audit log.

`status: "exited"`, or a sent `exitDate`, sets `status` to `exited`, stores `exitDate` (today in Karachi when the date is omitted), and sets the linked login `active: false`. Setting status back to `active` or `probation` clears `exitDate` and turns the login on again.

`GET /api/employees/:id` is the employee 360 view, not a flat employee:

```json
{
  "employee": { "id": "…", "name": "Eva" },
  "attendanceThisMonth": {
    "month": "2026-10",
    "present": 0,
    "late": 0,
    "halfDay": 0,
    "missingCheckout": 0,
    "absent": 0,
    "onLeave": 0,
    "lateArrivals": 0
  },
  "leaveBalances": [
    { "code": "ANNUAL", "name": "Annual", "paid": true, "quota": 14, "used": 0, "remaining": 14 }
  ],
  "lastPayslip": null
}
```

`leaveBalances` reads leave types and approved leave requests for the Karachi year. `quota` and `remaining` are null when the quota is unlimited. `lastPayslip` is `{ id, month, net }` or null. If a leave or payslip read fails because that module is not ready, that field is null and the profile still loads. List items stay the flat employee shape.

The list `search` matches name, code, or email on the server. Employees only receive their own row. The filter uses the employee document `_id`, because that collection has no field named `employee`.

CSV columns: `code,name,email,phone,address,department,designation,joinDate,status,gender,basicSalary`.

Department and designation are matched by name, ignoring case. Checks: required code, name, email, department, designation, join date, and salary; unique code and email in the file and in the database; email shape; a known department and designation; a real `YYYY-MM-DD` date; salary greater than 0 (and at least 1); status `active` or `probation`.

Dry run is the safe default. The write runs only when the query is exactly `dryRun=false`. The HTTP status is 200 even when `ok` is false. Nothing is written while `dryRun` is true or `errors` is not empty.

```json
{
  "success": true,
  "data": {
    "ok": false,
    "dryRun": true,
    "validRows": 1,
    "errors": [{ "row": 2, "field": "email", "reason": "Email is invalid" }]
  }
}
```

A commit adds `created` and `temporaryPasswords`: `[{ "row": 2, "email": "eva@example.com", "temporaryPassword": "Temp-…" }]`. Those passwords are returned once.

## M4 Attendance — implemented

Stored statuses: `present`, `late`, `half_day`, `missing_checkout`. `absent` and `on_leave` are calculated when the board or calendar is read. The enum allows saving them if a correction needs it.

`late` is its own boolean. A day can be `half_day` and `late: true`.

The server stamps `checkIn` and `checkOut` with its own clock. A time in the check-in body is ignored. Routes never accept a client clock.

Rules:

- One row per employee per Karachi date. A second check-in is `409` `Already checked in today`.
- Late when check-in is **after** `officeStart + graceMinutes`. With start `09:00` and grace `15`, `09:15` is `present` and `09:16` is `late`.
- `half_day` when worked minutes are under `halfDayHours * 60` (default 5 hours). Half day wins over `present` / `late` as the status. Keep `late` true if the arrival was late.
- `missing_checkout` is applied **on read** for a past day (`date` before today in Karachi) that has a check-in and no check-out. Today stays `present` or `late` until the day ends. The stored row is not rewritten.
- `absent` is applied **on read** for a working day on or before today with no attendance row and no approved leave. Future days stay `status: null`. Weekends and holidays are not marked absent.
- `on_leave` is applied on read when an approved `LeaveRequest` covers the date (`startDate <= date <= endDate`, status `approved`). The leave model is read directly. If both a row and leave exist, the attendance row wins.
- Working days come from `calendar.service.js`: `settings.weekend` and holidays, tentative included.
- Check-in is allowed on a weekend or holiday. The day is still stored.
- Check-out closes today's open row. If today has no check-in, it closes yesterday's open row so a shift can cross midnight. Check-out does not change `source`.
- A settings change does not recompute old `late` or `half_day` rows.

| Method | Path | Who | Body / query |
| --- | --- | --- | --- |
| POST | `/api/attendance/check-in` | HR or employee who has `employeeId`. Admin 403 | `{ "source": "web" }` or camera body below. `source` defaults to `web` |
| POST | `/api/attendance/check-out` | Same | Body may be `{}` |
| GET | `/api/attendance` | Admin and HR: all. Employee: own rows | `from`, `to`, `employeeId`, `departmentId`, `status`, `page`, `limit` |
| GET | `/api/attendance/board` | Admin, HR. Employee 403 | `date` (default today), `departmentId` |
| GET | `/api/attendance/calendar` | Employee: own month. Admin and HR must pass `employeeId` | `month=YYYY-MM` (default this month), `employeeId` |
| POST | `/api/attendance/corrections` | Employee or HR for themselves | `{ date, requestedCheckIn, requestedCheckOut, reason }` |
| GET | `/api/attendance/corrections` | Admin and HR: all. Employee: own | `status`, `page`, `limit` |
| POST | `/api/attendance/corrections/:id/review` | HR | `{ "decision": "approved", "comment": "…" }` decision is `approved` or `rejected` |

`GET /api/attendance` returns stored rows only. It overlays `missing_checkout` on past open rows, then applies the `status` filter. It does not invent `absent` or `on_leave` rows. The query reads at most 2000 matching rows before paging.

The daily board includes people who had joined by that date and had not exited before it. Each item is the employee (`employeeId`, `name`, `code`, `department`) plus the day (`status`, `late`, `checkIn`, `checkOut`, `source`, `attendanceId`, `workingDay`). Absent and on-leave people are included.

The month calendar returns `{ month, employeeId, days }`. Each day has `date`, `workingDay`, `status`, `late`, `checkIn`, `checkOut`, `source`, and `attendanceId`.

Camera check-in uses the same `POST /api/attendance/check-in`. Send either the flat body or the nested one:

```json
{ "source": "camera", "lat": 24.86, "lng": 67.01, "accuracy": 20, "faceCount": 1 }
```

```json
{
  "source": "camera",
  "location": { "lat": 24.86, "lng": 67.01, "accuracyMeters": 20 },
  "faceCount": 1
}
```

`accuracy` and `accuracyMeters` are meters. The server computes the Haversine distance to `officeLat` / `officeLng`. It stores `location` (including `distanceMeters` and `withinRadius`) and `faceCount`. It never stores a photo.

A failed camera check writes nothing. `422` messages:

| Check | Message |
| --- | --- |
| `faceCount` is not 1 | `Exactly one face must be in the frame` |
| accuracy greater than 100 | `GPS accuracy must be 100 meters or better` |
| distance greater than `radiusMeters` | `You are outside the office area` |
| office lat/lng is missing | `Office location is not set` |

Missing camera fields are `400` `Camera check-in needs lat, lng, accuracy, and faceCount`.

Corrections: `date` cannot be in the future. At least one of `requestedCheckIn` and `requestedCheckOut` is required. A time is `HH:mm` in Karachi or an ISO timestamp. HR review with `approved` updates or creates the attendance row for that employee and date, sets `source` to `correction`, and recalculates status from the **current** settings. `rejected` leaves attendance unchanged. The review response is `{ correction, attendance }`. Both the request and the review are audited. A second review is `409` `Correction has already been reviewed`.

Attendance item:

```json
{
  "id": "…",
  "employeeId": "…",
  "date": "2026-10-24",
  "checkIn": "2026-10-24T04:05:00.000Z",
  "checkOut": null,
  "status": "late",
  "late": true,
  "source": "web",
  "location": {
    "lat": null,
    "lng": null,
    "accuracyMeters": null,
    "distanceMeters": null,
    "withinRadius": null
  },
  "faceCount": null,
  "workedMinutes": null
}
```

`04:05Z` is 09:05 in Karachi.

## M5 Leave — implemented

Working days only. Skip the weekend list and holidays (tentative included). The stored `days` is that count. Later edits to the weekend do not rewrite it. Overlap with the same employee's pending or approved request, or days over the remaining balance, is `422` with a message that names the other dates or the remaining days. A range that is only weekend and holidays is `422` `The selected dates contain no working days`. Unpaid has no cap. Balance is `yearlyQuota - approved days` for requests whose start date is in that Karachi calendar year. Pending days do not reduce the balance until approved, and they are returned separately as `pending`.

Cancel is allowed for the owner only. A `pending` request can be cancelled. An `approved` request can be cancelled when `startDate` is after today in Asia/Karachi. A started or past approved request is `422`.

Reject requires `comment`. Approve may send an empty comment. Reviewing a request that is not `pending` is `409`. Approval checks overlap and balance again, because another request may have been approved in between. The employee gets a notification. `leave.apply`, `leave.cancel`, and `leave.review` are audited.

| Method | Path | Who |
| --- | --- | --- |
| GET | `/api/leave/balances` | Admin may pass `employeeId`. HR may pass `employeeId` or see own. Employee: own only. `?year=2026` |
| GET | `/api/leave/requests` | Admin and HR: all. Employee: own. `status`, `page`, `limit` |
| POST | `/api/leave/requests` | Employee, or HR with an employee id |
| POST | `/api/leave/requests/:id/cancel` | The owner, while pending |
| POST | `/api/leave/requests/:id/review` | HR. `{ "decision": "approved", "comment": "…" }` |

Create body: `{ leaveTypeId, startDate, endDate, reason }`. The server calculates `days`. Do not trust a day count from the client.

Balance response:

```json
{ "year": 2026, "employeeId": "…", "items": [{ "code": "ANNUAL", "name": "Annual", "paid": true, "quota": 14, "used": 0, "pending": 1, "remaining": 14 }] }
```

Unpaid: `quota` and `remaining` are null. `remaining` ignores `pending`.

Leave list item:

```json
{
  "id": "…",
  "employeeId": "…",
  "employeeName": "Eva",
  "employeeCode": "E-001",
  "departmentId": "…",
  "leaveType": { "id": "…", "code": "CASUAL", "name": "Casual", "paid": true },
  "startDate": "2026-10-30",
  "endDate": "2026-11-02",
  "days": 1,
  "reason": "Family event",
  "status": "pending",
  "reviewComment": "",
  "reviewedAt": null,
  "reviewedBy": null,
  "createdAt": "2026-10-24T12:00:00.000Z",
  "context": {
    "balance": { "quota": 10, "used": 0, "pending": 0, "remaining": 10, "before": 10, "after": 9 },
    "holidays": [{ "date": "2026-11-02", "name": "Test holiday", "tentative": true }],
    "colleaguesOnLeave": [{ "employeeId": "…", "name": "Ali", "startDate": "2026-10-30", "endDate": "2026-11-02", "days": 1, "code": "SICK" }],
    "approvedThisYear": [{ "id": "…", "code": "ANNUAL", "startDate": "2026-03-02", "endDate": "2026-03-03", "days": 2 }]
  }
}
```

`context` is only present for admin and HR. `balance.pending` is other pending requests of this type, not this one. `balance.before` is the remaining balance without this request. `balance.after` is what remains if this request is approved. `colleaguesOnLeave` is approved leave for other people in the same department whose dates overlap this request.

Filters on `GET /api/leave/requests`: `status`, `employeeId`, `departmentId`, `from`, `to`, `page`, `limit`. `from` and `to` keep requests that overlap that range.

## M6 Payroll — implemented

Gross = basic + hra + medical + other. The standard structure HR should save is hra = 40% of basic, medical = 10%, other = 0, so gross = 1.5 × basic. If HR typed different allowance amounts, use the stored amounts.

One active salary structure per employee. Older rows stay with `active: false`.

| Method | Path | Who |
| --- | --- | --- |
| GET | `/api/salary-structures` | Admin, HR. `?employeeId` |
| PUT | `/api/salary-structures/:employeeId` | HR. Body `{ basic, effectiveFrom, allowances? }`. Omitted allowances are derived: HRA 40% of basic, medical 10%, other 0. The previous active row is kept with `active: false` |
| POST | `/api/payroll/runs` | HR. Body `{ "month": "2026-10" }`. Creates the draft, or replaces payslips when the draft already exists. `409` if that month is finalized |
| GET | `/api/payroll/runs` | Admin, HR |
| GET | `/api/payroll/runs/:id` | Admin, HR. Includes payslips and their breakdowns |
| GET | `/api/payroll/runs/:id/checks` | Admin, HR. Safe to call before finalize |
| POST | `/api/payroll/runs/:id/finalize` | Admin. Body `{ "override": false }` or `{ "override": true, "reason": "…" }`. Locks the run. A second finalize or regenerate is 409 |
| GET | `/api/payslips` | Admin and HR: all. Employee: own. `?month&employeeId&page&limit` |
| GET | `/api/payslips/:id` | Same scope |
| GET | `/api/payslips/:id/pdf` | Same scope. `application/pdf` |

Month math:

- Working days `W` = days in the month that are not weekend and not a holiday.
- Employed working days `E` = those days on or after `joinDate` and on or before `exitDate` (if set).
- Per day = monthly gross / `W`.
- Pay before tax = per day × (`E` − absent − unpaid leave − 0.5 × half days).
- If `latePenalty.enabled`, also deduct `floor(lateCount / latesPerHalfDay) × 0.5 × per day`. This is off unless an admin enables it.
- Tax uses the **monthly structure gross × 12**, not the prorated pay. Monthly tax = annual tax / 12, then × (`E` / `W`) for joiners and leavers.

Annual tax on `gross × 12`:

| Annual gross | Tax |
| --- | --- |
| Up to 600,000 | 0 |
| Up to 1,200,000 | 5% of the amount above 600,000 |
| Up to 2,400,000 | 30,000 + 15% of the amount above 1,200,000 |
| Up to 3,600,000 | 210,000 + 25% of the amount above 2,400,000 |
| Above 3,600,000 | 510,000 + 35% of the amount above 3,600,000 |

Example: basic 100,000, hra 40,000, medical 10,000, other 0. Gross 150,000. Annual 1,800,000. Tax = 30,000 + 15% × 600,000 = 120,000 a year, 10,000 a month before proration.

Every payslip stores this `breakdown`. Top-level `gross`, `deductions`, `tax`, and `net` must match it. Also store `department` and `designation` ids from that moment.

```json
{
  "inputs": {
    "basic": 100000,
    "hra": 40000,
    "medical": 10000,
    "otherAllowances": 0,
    "grossMonthly": 150000,
    "annualGross": 1800000,
    "workingDays": 22,
    "employedWorkingDays": 22,
    "presentDays": 20,
    "lateDays": 1,
    "halfDays": 0,
    "absentDays": 1,
    "unpaidLeaveDays": 0,
    "paidLeaveDays": 0,
    "latePenaltyEnabled": false,
    "latesPerHalfDay": 3,
    "latePenaltyHalfDays": 0,
    "perDayRate": 6818.18,
    "joinDate": "2026-01-01",
    "exitDate": null,
    "periodStart": "2026-10-01",
    "periodEnd": "2026-10-31"
  },
  "earnings": {
    "basic": 100000,
    "hra": 40000,
    "medical": 10000,
    "otherAllowances": 0,
    "gross": 150000
  },
  "deductions": {
    "absent": 6818.18,
    "unpaidLeave": 0,
    "halfDay": 0,
    "latePenalty": 0,
    "total": 6818.18
  },
  "tax": {
    "annualGross": 1800000,
    "slabLabel": "30000 + 15% above 1200000",
    "annualTax": 120000,
    "monthlyTax": 10000,
    "formula": "30000 + 0.15 * (1800000 - 1200000) = 120000; monthly = 120000 / 12"
  },
  "net": 133181.82,
  "proration": {
    "applied": false,
    "employedWorkingDays": 22,
    "monthWorkingDays": 22,
    "factor": 1
  }
}
```

`net` = prorated earnings − deduction total − prorated monthly tax. In the example there is no proration, one absent day, and a full month of tax: 150,000 − 6,818.18 − 10,000.

`breakdown.lines` repeats those amounts with the inputs used for each line (days, per-day rate, slab formula). The PDF prints the same lines. `inputs` also includes `lateArrivals` (the late flag, used for the penalty) and `missingCheckoutDays`. `lateDays` is the count of status `late`.

Attendance for the run is not a stored status of `absent`. `summarizeEmployeeAttendance` uses the same day rules as the attendance board. A stored row wins (`half_day` and the `late` flag come from it). A past open check-in is `missing_checkout` even when the stored status is still `present`. With no row, approved leave is on leave: unpaid leave is deducted, paid leave is not. A past working day with neither is absent. Days after today are not absences, so a draft run in the middle of the month does not deduct the rest of the month. `missing_checkout` is paid, but it blocks finalize until it is resolved.

The salary row is the one whose `effectiveFrom` / `effectiveTo` covers the last day of the month. People with no such row are omitted from the payslips and listed in the checks.

Checks response:

```json
{
  "ok": false,
  "missingSalary": [{ "employeeId": "…", "name": "Noor", "code": "E-003" }],
  "missingCheckouts": [{ "attendanceId": "…", "employeeId": "…", "name": "Eva", "date": "2026-10-09" }],
  "pendingLeave": [{ "id": "…", "employeeId": "…", "name": "Eva", "startDate": "2026-10-26", "endDate": "2026-10-26" }],
  "pendingCorrections": [{ "id": "…", "employeeId": "…", "name": "Eva", "date": "2026-10-08" }]
}
```

A failed finalize is `422` with `errors` pointing at those lists. `override: true` without `reason` is `400`. A successful override writes `payroll.finalize` with the reason. Each employee who received a payslip gets a notification. Generating a draft writes `payroll.generate`. Saving a structure writes `salary.update`.

A finalized run sets `status: "finalized"`, `finalizedBy`, and `finalizedAt`. Draft totals live on the run: `{ employees, gross, deductions, tax, net }`. `employees` counts payslips, not people who were skipped for a missing structure.

## M7 Analytics — implemented

The planned paths were `GET /api/dashboards/admin`, `/hr`, and `/me`. This revision serves the same screens at `GET /api/analytics/admin`, `/hr`, and `/me`.

All numbers are computed on the server. Query `from`, `to` (`YYYY-MM-DD`), and optional `departmentId`. An employee call ignores `departmentId` and forces their own employee id. A range longer than 400 days is `400`. Percents are rounded to 2 decimals, and the rate is 0 when the denominator is 0.

Attendance counts are `summarizeEmployeeAttendance` in `src/services/attendanceSummary.service.js`. Payroll uses that same function, so a dashboard, a payslip, and an AI tool agree on present, late, half day, missing checkout, absent, and leave. A stored row wins. A past open check-in is `missing_checkout`. Approved leave covers a day with no row. A day after today in Asia/Karachi is not an absence. Bradford spells are the exception: they need the day sequence, so they use `loadClassifiedDays` and the same status rules.

Leave utilization reads approved requests from `listLeaveRequests` and quotas from `listLeaveTypes`. Payroll cost reads `listPayslips`. Admin and HR also see runs from `listPayrollRuns`. There is no second reader of those collections in the analytics service.

Formulas:

- Headcount: people employed on the end date. `joinDate` is on or before that date, `exitDate` is empty or on or after it, and a row marked `exited` with no `exitDate` is excluded. Someone who leaves on 15 October still counts on 1 October.
- Attrition %: exits whose `exitDate` falls in `[from, to]` ÷ average headcount × 100. Average headcount is (headcount on `from` + headcount on `to`) / 2.
- Attendance rate: (present + late + missing_checkout + 0.5 × half_day) ÷ (working-day slots − on_leave).
- Late %: late arrivals ÷ (present + late arrivals). The late flag counts, so a late half day counts. It is not only status `late`.
- Absenteeism: absent days ÷ expected working days, per department. Expected days are the working days in the person's employed window.
- Leave utilization: approved days ÷ (yearly quota × department headcount on `to`), per paid leave type and department. Unpaid leave and a null quota are skipped.
- Payroll cost: sum of payslip `gross` for each `YYYY-MM` touched by the range. `departmentId` is applied in memory, because the payslip list has no department query. Empty slips return `payrollCost: 0` and `averageSalary: 0`.
- Average salary: mean gross. Admin and HR also get that mean by department and by designation.
- Tenure buckets, measured to the end date: `<1y` under 365 days, `1-3y` under 3 × 365 days, otherwise `3y+`.

### GET `/api/analytics/admin`

Admin only. HR and employees receive `403`.

```json
{
  "headcount": 0,
  "attritionRate": 0,
  "exits": 0,
  "averageHeadcount": 0,
  "attendanceRate": 0,
  "lateRate": 0,
  "payrollCost": 0,
  "averageSalary": 0,
  "headcountByDepartment": [{ "departmentId": "…", "name": "Engineering", "count": 0 }],
  "payrollCostByDepartment": [{ "departmentId": "…", "name": "Engineering", "gross": 0, "net": 0, "averageSalary": 0 }],
  "averageSalaryByDesignation": [{ "designationId": "…", "name": "Engineer", "gross": 0, "averageSalary": 0 }],
  "gender": [{ "gender": "female", "count": 0 }],
  "tenureBuckets": [
    { "label": "<1y", "count": 0 },
    { "label": "1-3y", "count": 0 },
    { "label": "3y+", "count": 0 }
  ],
  "audit": []
}
```

`audit` is the latest 10 rows from the same list as `GET /api/audit`. `exits` and `averageHeadcount` sit beside `attritionRate` so the percent can be checked.

### GET `/api/analytics/hr`

Admin and HR. Employees receive `403`.

```json
{
  "headcount": 0,
  "presentToday": 0,
  "onLeaveToday": 0,
  "lateToday": 0,
  "pendingLeave": 0,
  "pendingCorrections": 0,
  "attendanceTrend": [{ "date": "2026-10-05", "rate": 0 }],
  "absenteeismByDepartment": [{ "departmentId": "…", "name": "Engineering", "absentDays": 0, "expectedDays": 0, "rate": 0 }],
  "leaveByType": [{ "code": "ANNUAL", "days": 0 }],
  "leaveUtilization": [{ "code": "ANNUAL", "name": "Annual", "departmentId": "…", "approvedDays": 0, "quota": 0, "rate": 0 }],
  "topLateComers": [{ "employeeId": "…", "name": "Eva", "lateDays": 0 }]
}
```

`presentToday`, `onLeaveToday`, and `lateToday` use `summarizeEmployeeAttendance` for today in Asia/Karachi. `pendingLeave` is the total from `listLeaveRequests` with `status=pending`. `topLateComers` is at most 5, ordered by late arrivals. `lateDays` in that list is the late-arrival count, including a late half day. Trend days after today are omitted. A leave day has rate 0 because the denominator is 0.

### GET `/api/analytics/me`

Any logged-in user who has an employee profile. `403` if they do not. Query filters are ignored. This is their own week and month, not the company.

```json
{
  "checkedIn": false,
  "todayStatus": null,
  "hoursThisWeek": 0,
  "expectedHours": 40,
  "lateCount": 0,
  "leaveBalances": [{ "code": "ANNUAL", "quota": 14, "used": 0, "remaining": 14 }],
  "lastPayslip": null
}
```

`lateCount` is `summarizeEmployeeAttendance` from the first of this month through today. `leaveBalances` come from `getLeaveBalances`. `lastPayslip` is `{ id, month, net }` from `listPayslips`, or null. `todayStatus` is one of `on_leave`, `missing_checkout`, `half_day`, `late`, `present`, `absent`, or null when today is not a working day.

### GET `/api/analytics/anomalies`

Admin and HR. The window is the 12 months ending on `to`, not the KPI `from`. Each returned person has at least one plain-language `reasons` entry.

- Bradford Factor is spells² × absent days. A spell is consecutive absent working days. A weekend does not split a spell. 50 or more is `watch`, 125 or more is `concern`, 400 or more is `serious`.
- Monday/Friday: at least 3 absences, and at least half of them on Monday or Friday.
- Holiday-adjacent: at least 2 absences on the nearest working day before or after a holiday.

```json
{
  "from": "2025-10-31",
  "to": "2026-10-31",
  "flags": [{
    "employeeId": "…",
    "name": "Eva",
    "department": { "id": "…", "name": "Engineering" },
    "bradford": 50,
    "level": "watch",
    "reasons": ["Bradford Factor is 50 (5 spells, 2 days) over 12 months."]
  }]
}
```

### GET `/api/analytics/attrition-risk`

Admin and HR. This is a fixed point list, not a trained model. Only `active` and `probation` people are scored. A score of 0 is omitted. The score is capped at 100.

| Driver | Points | When |
| --- | --- | --- |
| tenure | 25 | Status is `probation`, or tenure on `to` is under 183 days |
| late | 25 | Late rate in the filter range is 20% or more |
| absenteeism | 25 | Absent days are 10% or more of expected working days |
| unpaidLeave | 15 | Any unpaid leave day in the range |
| salary | 10 | `salary.basic` is below the department median basic |

Late rate, absenteeism, and unpaid days come from `getAttendanceSummary`, which calls `summarizeEmployeeAttendance`.

```json
{
  "from": "2026-10-01",
  "to": "2026-10-31",
  "items": [{
    "employeeId": "…",
    "name": "Eva",
    "department": { "id": "…", "name": "Engineering" },
    "score": 25,
    "drivers": [{ "key": "late", "points": 25, "reason": "Late arrival rate is 66.67% in this period." }]
  }]
}
```

## M8 AI — implemented

`AI_API_KEY` stays on the server. Empty is allowed at boot. `AI_BASE_URL` defaults to `https://generativelanguage.googleapis.com/v1beta/openai/`. `AI_MODEL` defaults to `gemini-2.5-flash`. The call is OpenAI-compatible `POST {base}chat/completions`. Timeout is `AI_TIMEOUT_MS` (default 15000). `AI_RATE_LIMIT` defaults to 20 requests per user per rolling hour. The 429 message is `Too many AI requests. Try again in an hour.` Every call is logged in `aiLogs` with `feature` `chat`, `summary`, `smart_leave`, `explain_payslip`, or `policy`.

Answers include `"label": "AI-generated"` and `"aiGenerated": true`. A provider failure, timeout, or missing key returns HTTP 200 with `fallback: true` and a short sentence (`The assistant is not configured yet.`, `The assistant took too long. Please try again.`, or `I could not reach the assistant. Please try again in a moment.`). `403`, `404`, and `429` still use those status codes.

The model does not query MongoDB. Tools call the same services as the REST API, with `req.user`. The tool loop stops after 3 rounds, with at most 4 calls in a round. Chat accepts `{ "message": "…" }` or `{ "messages": [{ "role": "user", "content": "…" }] }`. System messages from the client are dropped.

Tools: `get_headcount`, `get_attendance_summary`, `get_late_comers`, `get_leave_summary`, `get_my_leave_balance`, `get_payroll_summary`, `search_employees`. `get_leave_summary` uses `getLeaveSummary`. `get_my_leave_balance` uses `getLeaveBalances`. `get_payroll_summary` uses `getPayrollSummary`. If the model passes `employeeId`, `assertOwnEmployee` runs before any of those reads. An employee asking for a colleague's salary is refused by that helper. The refusal is `{ refused: true, message }` and is listed in `sources`. The model is not given the hidden number. `search_employees` drops `salary` for an employee caller. `get_late_comers` is `403` for an employee.

| Method | Path | Who | Body |
| --- | --- | --- | --- |
| POST | `/api/ai/chat` | All roles, scoped | `{ "message": "Who is on leave today?" }` |
| POST | `/api/ai/summary` | Admin, HR | `{ "kpis": { "headcount": 12 }, "filters": { "from": "2026-10-01", "to": "2026-10-31" } }` |
| POST | `/api/ai/smart-leave` | Employee, or HR | `{ "text": "Need next Monday and Tuesday off for a wedding" }` |
| POST | `/api/ai/explain-payslip` | All roles, scoped | `{ "payslipId": "…" }` |
| POST | `/api/ai/policy` | All roles | `{ "question": "When am I marked late?" }` |

Chat response:

```json
{
  "success": true,
  "data": {
    "answer": "…",
    "label": "AI-generated",
    "aiGenerated": true,
    "tools": ["get_leave_summary"],
    "sources": [{ "tool": "get_leave_summary", "args": {}, "resultSummary": "…" }]
  }
}
```

Summary response: `{ bullets, fallback, label, aiGenerated }` with 3 to 5 bullets. The prompt says to use only the `kpis` object you send. If the model returns invalid JSON, the server retries once, then builds fallback bullets from those keys. It does not look up new numbers.

Smart leave response. The client shows this in the form. Nothing is saved until `POST /api/leave/requests`.

```json
{
  "success": true,
  "data": {
    "type": "CASUAL",
    "start": "2026-10-26",
    "end": "2026-10-27",
    "reason": "Sister's wedding",
    "leaveTypeCode": "CASUAL",
    "startDate": "2026-10-26",
    "endDate": "2026-10-27",
    "fallback": false,
    "label": "AI-generated",
    "aiGenerated": true
  }
}
```

`type` must be a live leave-type code. Dates must be real `YYYY-MM-DD` values with `end` on or after `start`. Invalid JSON is retried once. A second failure, or a code that is not a leave type, returns `fallback: true` and null fields.

`POST /api/ai/explain-payslip` loads the slip with `getPayslip`, so an employee cannot explain a colleague's slip (`403`). The prompt tells the model to describe the stored breakdown and not recalculate it.

Policy answers may only use the rules in the hackathon brief (office hours, leave quotas, payroll, who can approve) plus the live settings and leave types. If the question is outside those rules, the answer says it does not know. The same rules are in the chat system prompt. The assistant replies in English, Urdu, or Roman Urdu, matching the user.

## M9 Comms and audit

### GET `/api/audit` — implemented

Admin only. Query: `page`, `limit`, `action`, `entity`, `entityId`, `actor` (user id), `from`, `to` (ISO dates).

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "…",
        "actor": { "id": "…", "name": "Ada Admin", "email": "ada@example.com", "role": "admin" },
        "action": "setup.complete",
        "entity": "Settings",
        "entityId": "…",
        "before": null,
        "after": { "companyName": "Saylani" },
        "timestamp": "2026-10-24T13:00:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20
  }
}
```

There is no POST, PATCH, or DELETE. Services call `recordAudit` in `src/services/audit.service.js`.

Actions written today: `setup.complete`, `user.create`, `user.update`, `user.password_change`, `settings.update`, `department.create`, `department.update`, `department.delete`, `designation.create`, `designation.update`, `designation.delete`, `leaveType.create`, `leaveType.update`, `leaveType.delete`, `holiday.create`, `holiday.update`, `holiday.delete`, `employee.create`, `employee.update`, `attendance.check_in`, `attendance.check_out`, `attendanceCorrection.create`, `attendanceCorrection.review`, `leave.apply`, `leave.cancel`, `leave.review`, `salary.update`, `payroll.generate`, `payroll.finalize`, `announcement.create`, `announcement.update`.

`payroll.finalize` stores `override` and `reason` when Admin locked a month that failed the checks. Temporary passwords are not written to the log. Snapshots do not include password hashes.

### Announcements — implemented

| Method | Path | Who |
| --- | --- | --- |
| GET | `/api/announcements` | Any logged-in user. Employees see `active` rows whose audience is `all` or `employee`. Admin and HR can pass `?includeInactive=true` |
| POST | `/api/announcements` | Admin, HR. `{ title, body, audience }` audience is `all`, `admin`, `hr`, or `employee` |
| PATCH | `/api/announcements/:id` | Admin, HR. `{ title, body, audience, active }` |

Item: `{ id, title, body, audience, active, createdBy: { id, name }, createdAt }`.

### Notifications — implemented

Created by leave review and by payroll finalize. Other services call `notify` in `src/services/notification.service.js`. The user only sees rows with their login id. A missing id is `404`, including when the row belongs to someone else.

`GET /api/notifications` adds `unreadCount` next to `items`, `total`, `page`, and `limit`.

`GET /api/notifications/unread-count` returns `{ "count": 1 }`.

| Method | Path | Who |
| --- | --- | --- |
| GET | `/api/notifications` | Own. `?page&limit` |
| POST | `/api/notifications/:id/read` | Own |
| POST | `/api/notifications/read-all` | Own |

Item: `{ id, title, body, type, read, entity, entityId, createdAt }`. `type` is `leave`, `payslip`, `announcement`, `attendance`, or `system`.
