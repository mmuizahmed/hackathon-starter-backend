# How this backend works

This is the map for the demo and for interview questions. The code is plain JavaScript. Business rules live in services. Routes do not talk to MongoDB themselves.

## Folder

```text
src/server.js            starts the process and, if the env admin is set, runs setup once
src/app.js               helmet, CORS, JSON, cookie, then the two auth middlewares, then routes
src/routes/              URL to controller
src/controllers/         read the request, call one service, send JSON
src/services/            rules: setup, login, password change, audit, employee scope
src/models/              MongoDB collections
src/middleware/          cookie user, password gate, role check, validation, errors
src/utils/timezone.js    Asia/Karachi dates. Use this. Do not parse dates in a route.
```

A new feature should add a route, a thin controller, and a service. The service is the part the AI assistant will call later, with the same user that `requireAuth` put on the request.

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

## Roles and data scope

Three roles: `admin`, `hr`, `employee`.

`requireRole('admin')` checks `req.user.role` after the database load. HR opening `GET /api/audit` gets `403` and the message `You do not have access to this resource`.

Data scope is separate from the role. An employee id and a user id are different. The user row has `employee`, which points at the employee row. Attendance, leave, and payslips store that employee id.

`src/services/scope.service.js`:

- `employeeScopeFilter(user)` returns `{ employee: user.employeeId }` for an employee, and `{}` for admin or HR (no extra filter).
- If an employee login has no linked profile, the filter is `{ employee: { $in: [] } }`, which matches nothing. A broken login must not see every row.
- `assertOwnEmployee(user, employeeId)` throws `403` when an employee asks for someone else's id.

Later services should spread that filter into `Model.find`. Notifications are the exception: they are stored by **user id**, because every login has one, even HR with no employee profile.

There is no employee data route in this revision. The helper is tested on its own so the next module can use it without inventing a second rule.

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

Optional env path: if `ADMIN_EMAIL` and `ADMIN_PASSWORD` are both set, `server.js` calls the same `completeSetup` after MongoDB connects. `COMPANY_NAME` defaults to `HCM Lite`. Leave those variables empty on Render so judges can use the screen on an empty database.

## Audit log

`recordAudit({ actorId, action, entity, entityId, before, after })` inserts one row. Call it from the service after a successful change. Do not put `passwordHash` in `before` or `after`.

Login and logout are not audited. Setup, user create, and password change are.

`GET /api/audit` is admin only. Filters: `action`, `entity`, `entityId`, `actor`, `from`, `to`, plus `page` and `limit`.

The model throws if something calls update or delete. There is no such route. That matches the brief: nobody edits the audit log, including admin.

## Dates

Store business dates as `YYYY-MM-DD` strings from `src/utils/timezone.js`. Pakistan is UTC+5 all year. A check-in at 00:30 in Karachi must not be saved as the previous UTC date. `checkIn` and `checkOut` are real timestamps. The server sets them. Do not trust a time sent by the browser.

## What is not built

Department screens, employee registration, check-in, leave approval, payroll, dashboards, announcements, and the AI chat. The collections and the URL contract are already in the repo so those pieces can be added without changing these schemas for style.

The AI module must call these services with `req.user`. It must not query MongoDB with its own rules, and it must not see `AI_API_KEY` in the browser.

## Interview questions

**Why is the token in an httpOnly cookie?**
So a script on the page cannot read it. The Vercel proxy makes the cookie first-party. The JSON body never includes the token.

**Why do you reload the user on every request instead of trusting the JWT role?**
The token only proves who signed in. Role, `active`, and `mustChangePassword` can change while the token is still valid. Those fields come from MongoDB.

**What happens on a brand new database?**
`/api/setup/status` says `initialized: false`. No employees, no leave types, no admin. Setup creates the company, the four leave quotas, and one admin. It cannot run twice.

**How do you stop an employee from opening someone else's salary?**
The route will use `assertOwnEmployee` or `employeeScopeFilter`. Both compare the employee id on the row with `req.user.employeeId`, which is not the login id. Admin and HR skip that filter. This revision has the helper and the test. The salary route is not built yet.

**What does `mustChangePassword` block?**
Every path except health, setup, login, logout, me, and change password. The check is in one middleware in `app.js`, so a new module route is blocked too.

**Can admin edit the audit log?**
No. `GET /api/audit` is the only audit route, and the schema rejects updates and deletes. Password hashes are not stored in the log.

**Where will the payroll formula live?**
In a payroll service, not in a route. The payslip stores a `breakdown` object with the inputs, each line, and the tax slab math. The shape is fixed in `src/models/Payslip.js` and `docs/API.md`.

**Why are attendance dates strings?**
They are Karachi calendar days. Timestamps alone shift the day when the server is in UTC. `src/utils/timezone.js` is the only place that converts.

**What if `JWT_SECRET` is missing?**
The process exits before it listens, with `Configuration error:`. Render already has this variable set.

**How will the AI follow roles?**
The chat route will take `req.user` and call the same services. An employee asking for a colleague's salary hits the scope helper and is refused. The model never gets a MongoDB connection string.
