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
| 403 | `Account is deactivated`, `Password change required`, `You do not have access to this resource`, `You can only access your own records` |
| 409 | Setup already done, second check-in of the day, or a duplicate unique field |
| 422 | Leave overlap or not enough balance (planned) |
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

| Method | Path | Who |
| --- | --- | --- |
| GET | `/api/health` | Public |
| GET | `/api/setup/status` | Public |
| POST | `/api/setup` | Public, once |
| POST | `/api/auth/login` | Public |
| POST | `/api/auth/logout` | Public |
| GET | `/api/auth/me` | Any logged-in user |
| POST | `/api/auth/change-password` | Any logged-in user |
| GET | `/api/audit` | Admin |

## Role rules used for the planned routes

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
| Attendance board | All | All | Own |
| Attendance correction | View | Approve | Request own |
| Apply, cancel, balance | View records | Own, and view all requests | Own |
| Approve leave | View | Approve | No |
| Salary structure | View | Manage | No |
| Payroll draft | View | Manage | No |
| Finalize payroll | Yes | No | No |
| Payslips | All | All | Own |
| Dashboards | Company | HR | Personal |
| AI chat | All data | HR data | Own data |
| AI summary | Yes | Yes | No |
| Smart leave | No | Own | Own |
| Policy Q&A | Yes | Yes | Yes |
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

## M2 Organization — planned

Settings rules apply to **new** attendance, leave, and payroll records. Do not rewrite old rows when settings change.

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
| PATCH | `/api/settings` | Admin | Any of the fields above except `id` |

| Method | Path | Who | Body |
| --- | --- | --- | --- |
| GET | `/api/departments` | Admin, HR | List |
| POST | `/api/departments` | Admin | `{ "name": "Engineering" }` |
| PATCH | `/api/departments/:id` | Admin | `{ "name": "Engineering", "active": true }` |
| GET | `/api/designations` | Admin, HR | List |
| POST | `/api/designations` | Admin | `{ "name": "Engineer" }` |
| PATCH | `/api/designations/:id` | Admin | `{ "name": "Engineer", "active": true }` |

Department and designation item: `{ id, name, active, createdAt, updatedAt }`. Names are unique.

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/api/leave-types` | Admin, HR | |
| POST | `/api/leave-types` | Admin | `{ name, code, yearlyQuota, paid }`. `yearlyQuota` null means unlimited |
| PATCH | `/api/leave-types/:id` | Admin | Same fields plus `active` |
| GET | `/api/holidays` | Admin, HR | `?year=2026` optional |
| POST | `/api/holidays` | Admin | `{ date, name, tentative }` |
| PATCH | `/api/holidays/:id` | Admin | Same fields |
| DELETE | `/api/holidays/:id` | Admin | Mistyped holidays only. Write an audit row |

`tentative: true` is a moon-sighting holiday. It still counts as a holiday until someone edits it.

Holiday item: `{ id, date, name, tentative }`.

### Users — planned

Admin only. This creates **HR** logins. Employee logins are created by `POST /api/employees`. This route does not create another admin.

| Method | Path | Body / query |
| --- | --- | --- |
| GET | `/api/users` | `?role&active&page&limit` |
| POST | `/api/users` | `{ name, email, password }` role is forced to `hr`, `mustChangePassword` true |
| PATCH | `/api/users/:id` | `{ active?: boolean, resetPassword?: boolean }` |

When `resetPassword` is true, the response includes `temporaryPassword` once and sets `mustChangePassword` true. Do not return `passwordHash`.

User list item is the public user plus `active`.

## M3 Employees — planned

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
| GET | `/api/employees/:id` | Admin and HR: any. Employee: own, else 403 |
| PATCH | `/api/employees/:id` | HR: all editable fields. Employee: `phone` and `address` only. Admin: 403 |
| POST | `/api/employees/import` | HR. Multipart field `file`. `?dryRun=true` writes nothing |
| GET | `/api/employees/export` | HR. `text/csv` |

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

This creates the employee and a user with the same email, role `employee`, `mustChangePassword: true`, and a temporary password. Response includes `employee` and `temporaryPassword` once.

CSV columns: `code,name,email,phone,address,department,designation,joinDate,status,gender,basicSalary`.

Dry run:

```json
{
  "success": true,
  "data": {
    "ok": false,
    "validRows": 1,
    "errors": [{ "row": 2, "field": "email", "reason": "Email already exists" }]
  }
}
```

Check required fields, unique code and email, email shape, known department and designation names, ISO `joinDate`, and `basicSalary > 0`. `dryRun=false` writes only when `errors` is empty.

Search is server-side. Do not return the whole collection for the client to filter.

## M4 Attendance — planned

Stored statuses: `present`, `late`, `half_day`, `missing_checkout`. `absent` and `on_leave` are calculated for a day with no row, or with approved leave. The enum allows saving them if a correction needs it.

`late` is its own boolean. A day can be `half_day` and `late: true`.

Rules, using the settings copied at check-in time:

- One row per employee per Karachi date. A second check-in is `409`.
- Late when check-in is **after** `officeStart + graceMinutes` (09:15 is on time if start is 09:00 and grace is 15).
- `half_day` when worked hours are under `halfDayHours` (default 5). Half day wins over `present` / `late` as the status. Keep `late` true if the arrival was late.
- `missing_checkout` when there is a check-in and no check-out at the time the board or payroll is built.
- `absent` when there is no row and no approved leave on that working day.
- Weekend days come from settings. Holidays, including tentative ones, are not working days.

| Method | Path | Who | Body / query |
| --- | --- | --- | --- |
| POST | `/api/attendance/check-in` | HR or employee who has `employeeId`. Admin 403 | `{ "source": "web" }` or camera body below |
| POST | `/api/attendance/check-out` | Same | `{ "source": "web" }` |
| GET | `/api/attendance` | Admin and HR: all. Employee: forced to own id | `from`, `to`, `employeeId`, `departmentId`, `status`, `page`, `limit` |
| POST | `/api/attendance/corrections` | Employee or HR for themselves | `{ date, requestedCheckIn, requestedCheckOut, reason }` |
| GET | `/api/attendance/corrections` | Admin and HR: all. Employee: own | `status`, `page`, `limit` |
| POST | `/api/attendance/corrections/:id/review` | HR | `{ "decision": "approved", "comment": "…" }` decision is `approved` or `rejected` |

Camera body (optional bonus). The server decides. The client only sends measurements.

```json
{
  "source": "camera",
  "location": { "lat": 24.86, "lng": 67.01, "accuracyMeters": 20 },
  "faceCount": 1
}
```

Reject when `faceCount` is not 1, accuracy is worse than 100 meters, office lat/lng is missing, or the Haversine distance to the office is greater than `radiusMeters`. Store the result, not a photo. `source` is `camera`. A failed camera check does not write a present row. The person asks HR for a correction.

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

## M5 Leave — planned

Working days only. Skip the weekend list and holidays (tentative included). Overlap with another pending or approved request, or days over the remaining balance, is `422`. Unpaid has no cap. Balance is `yearlyQuota - approved days` for the Karachi calendar year. Pending days do not reduce the balance until approved. Cancel is allowed only while `pending`.

| Method | Path | Who |
| --- | --- | --- |
| GET | `/api/leave/balances` | Admin may pass `employeeId`. HR may pass `employeeId` or see own. Employee: own only. `?year=2026` |
| GET | `/api/leave/requests` | Admin and HR: all. Employee: own. `status`, `page`, `limit` |
| POST | `/api/leave/requests` | Employee, or HR with an employee id |
| POST | `/api/leave/requests/:id/cancel` | The owner, while pending |
| POST | `/api/leave/requests/:id/review` | HR. `{ "decision": "approved", "comment": "…" }` |

Create body: `{ leaveTypeId, startDate, endDate, reason }`. The server calculates `days`. Do not trust a day count from the client.

Balance item: `{ code, name, paid, quota, used, remaining }`. Unpaid: `quota` and `remaining` are null.

## M6 Payroll — planned

Gross = basic + hra + medical + other. The standard structure HR should save is hra = 40% of basic, medical = 10%, other = 0, so gross = 1.5 × basic. If HR typed different allowance amounts, use the stored amounts.

One active salary structure per employee. Older rows stay with `active: false`.

| Method | Path | Who |
| --- | --- | --- |
| GET | `/api/salary-structures` | Admin, HR. `?employeeId` |
| PUT | `/api/salary-structures/:employeeId` | HR. Body `{ basic, allowances: { hra, medical, other }, effectiveFrom }` |
| POST | `/api/payroll/runs` | HR. Body `{ "month": "2026-10" }`. One run per month |
| GET | `/api/payroll/runs` | Admin, HR |
| GET | `/api/payroll/runs/:id` | Admin, HR. Includes payslip summaries |
| POST | `/api/payroll/runs/:id/finalize` | Admin. Locks the run. A second finalize or any edit after this is 409 |
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

A finalized run sets `status: "finalized"`, `finalizedBy`, and `finalizedAt`. Draft totals live on the run: `{ employees, gross, deductions, tax, net }`.

## M7 Dashboards — planned

All numbers are computed on the server. Query `from`, `to` (`YYYY-MM-DD`), and optional `departmentId`. Employee dashboard ignores `departmentId` and uses the caller.

Formulas:

- Headcount: employees with status `active` or `probation` on the end date (joined on or before it, and not exited before it).
- Attrition %: exits in the period ÷ average headcount × 100.
- Attendance rate: (present + late + missing_checkout + 0.5 × half_day) ÷ (working-day slots − on_leave).
- Late %: late ÷ (present + late). Use the `late` flag, not only status `late`, so a late half day counts.
- Absenteeism: absent days ÷ expected working days, per department.
- Leave utilization: approved days ÷ quota, per leave type and department. Skip unpaid.
- Payroll cost: sum of gross and of net by month and department.
- Average salary: mean gross by department and by designation.

### GET `/api/dashboards/admin`

Admin only.

```json
{
  "headcount": 0,
  "attritionRate": 0,
  "payrollCost": 0,
  "averageSalary": 0,
  "headcountByDepartment": [{ "departmentId": "…", "name": "Engineering", "count": 0 }],
  "payrollCostByDepartment": [{ "departmentId": "…", "name": "Engineering", "gross": 0, "net": 0 }],
  "gender": [{ "gender": "female", "count": 0 }],
  "tenureBuckets": [
    { "label": "<1y", "count": 0 },
    { "label": "1-3y", "count": 0 },
    { "label": "3y+", "count": 0 }
  ]
}
```

The audit feed on the admin screen is `GET /api/audit?limit=10`, not a second dashboard field.

### GET `/api/dashboards/hr`

Admin and HR.

```json
{
  "headcount": 0,
  "presentToday": 0,
  "onLeaveToday": 0,
  "lateToday": 0,
  "pendingLeave": 0,
  "pendingCorrections": 0,
  "attendanceTrend": [{ "date": "2026-10-24", "rate": 0 }],
  "absenteeismByDepartment": [{ "departmentId": "…", "name": "Engineering", "rate": 0 }],
  "leaveByType": [{ "code": "SICK", "days": 0 }],
  "topLateComers": [{ "employeeId": "…", "name": "Eva", "lateDays": 0 }]
}
```

`topLateComers` is at most 5 for the filtered range.

### GET `/api/dashboards/me`

The signed-in employee (or HR with an employee id). 403 if they have no employee id.

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

`lastPayslip` is `{ id, month, net }` or null.

## M8 AI — planned

`AI_API_KEY` stays on the server. Timeout 15 seconds. About 20 requests per user per hour. Log every call in `aiLogs`. Answers include `"label": "AI-generated"`. On failure, return a friendly message and still log `status`.

The model must not query MongoDB. Tools call the same services as the REST API, with `req.user` passed in. The model must not save data. Smart-leave JSON is validated. If it fails, retry once, then the client shows the normal form.

Tools: `get_headcount`, `get_attendance_summary`, `get_late_comers`, `get_leave_summary`, `get_my_leave_balance`, `get_payroll_summary`, `search_employees`. An employee tool call uses the scope helper. A salary question about someone else is refused by the service, not only by the prompt.

| Method | Path | Who | Body |
| --- | --- | --- | --- |
| POST | `/api/ai/chat` | All roles, scoped | `{ "message": "Who is on leave today?" }` |
| POST | `/api/ai/summary` | Admin, HR | `{ "dashboard": "hr", "from": "2026-10-01", "to": "2026-10-31", "departmentId": null }` |
| POST | `/api/ai/smart-leave` | Employee, or HR with an employee id | `{ "text": "Need next Monday and Tuesday off for a wedding" }` |
| POST | `/api/ai/policy` | All roles | `{ "question": "When am I marked late?" }` |

Chat response:

```json
{ "success": true, "data": { "answer": "…", "label": "AI-generated", "tools": ["get_leave_summary"] } }
```

Summary response: `{ bullets: ["…", "…"], label: "AI-generated" }` with 3 to 5 bullets that use only the dashboard numbers you send the model.

Smart leave response:

```json
{
  "success": true,
  "data": {
    "leaveTypeCode": "CASUAL",
    "startDate": "2026-10-26",
    "endDate": "2026-10-27",
    "reason": "Sister's wedding",
    "label": "AI-generated"
  }
}
```

The client shows this in the form. Nothing is saved until `POST /api/leave/requests`.

Policy answers may only use the rules in the hackathon brief (office hours, leave quotas, payroll, who can approve). If the question is outside those rules, the answer says it does not know.

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

Actions written today: `setup.complete`, `user.create`, `user.password_change`. Later modules should add `employee.create`, `employee.update`, `leave.review`, `attendance.review`, `payroll.finalize`, and `settings.update`, with `before` and `after` snapshots and no password hashes.

### Announcements — planned

| Method | Path | Who |
| --- | --- | --- |
| GET | `/api/announcements` | Any logged-in user. Employees see `active` rows whose audience is `all` or `employee`. Admin and HR can pass `?includeInactive=true` |
| POST | `/api/announcements` | Admin, HR. `{ title, body, audience }` audience is `all`, `admin`, `hr`, or `employee` |
| PATCH | `/api/announcements/:id` | Admin, HR. `{ title, body, audience, active }` |

Item: `{ id, title, body, audience, active, createdBy: { id, name }, createdAt }`.

### Notifications — planned

Created by leave review and by payroll finalize. The user only sees rows with their login id.

| Method | Path | Who |
| --- | --- | --- |
| GET | `/api/notifications` | Own. `?page&limit` |
| POST | `/api/notifications/:id/read` | Own |
| POST | `/api/notifications/read-all` | Own |

Item: `{ id, title, body, type, read, entity, entityId, createdAt }`. `type` is `leave`, `payslip`, `announcement`, `attendance`, or `system`.
