# Module status

Judges start from an empty database. Nothing in this repo inserts sample employees.

| Module | Status | In this revision | Next |
| --- | --- | --- | --- |
| M1 Auth and access | Foundation done | Setup, login, logout, me, change password, role guard, password gate, employee scope helper | Menus are frontend |
| M2 Organization | Done | Settings GET/PUT, departments, designations, leave-type quotas, holidays, HR user admin. `calendar.service.js` is the shared working-day API | |
| M3 Employees | Done | Register with a one-time temp password, search, filters, paging, employee 360, exit, CSV dry run and export | |
| M4 Attendance | Done | Check-in and check-out, camera checks, daily board, month calendar, corrections | Payroll reads these rows |
| M5 Leave | Implemented | Apply, cancel, balance, history, HR inbox with context, approve/reject, notifications, audit | |
| M6 Payroll | Implemented | Salary history, draft and regenerate, tax, proration, checks, admin finalize, payslip PDF | |
| M7 Dashboards | Implemented | `GET /api/analytics/admin`, `/hr`, `/me`, plus anomalies and attrition risk. Counts come from `summarizeEmployeeAttendance`. Leave and payroll widgets call those services | |
| M8 AI assistant | Implemented | Chat tools, summary, smart leave, explain payslip, policy. `aiLogs`, rate limit, timeout. Tools call the same services with `req.user` | |
| M9 Comms and audit | Implemented | Announcements, notifications, `notify`, audit read. Leave and payroll write audit rows. AI calls write `aiLogs` | |

Business rules stay in `src/services/`. Analytics and the AI tools call those functions. They do not keep a second copy of the attendance, leave, or payroll rules.
