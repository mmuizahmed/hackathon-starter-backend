# Module status

Judges start from an empty database. Nothing in this repo inserts sample employees.

| Module | Status | In this revision | Next |
| --- | --- | --- | --- |
| M1 Auth and access | Foundation done | Setup, login, logout, me, change password, role guard, password gate, employee scope helper | Menus are frontend |
| M2 Organization | Done | Settings GET/PUT, departments, designations, leave-type quotas, holidays, HR user admin. `calendar.service.js` is the shared working-day API | |
| M3 Employees | Done | Register with a one-time temp password, search, filters, paging, employee 360, exit, CSV dry run and export | |
| M4 Attendance | Done | Check-in and check-out, camera checks, daily board, month calendar, corrections | Payroll reads these rows |
| M5 Leave | Implemented | Apply, cancel, balance, history, HR inbox with context, approve/reject, notifications, audit | Dashboard leave widgets |
| M6 Payroll | Implemented | Salary history, draft and regenerate, tax, proration, checks, admin finalize, payslip PDF | Dashboard payroll cost reads these payslips |
| M7 Dashboards | Not started | Formulas are in `docs/API.md`. Reuse `summarizeEmployeeAttendance` | Aggregate on the server |
| M8 AI assistant | Not started | `aiLogs` model. `AI_API_KEY` is accepted and unused | Tools must call the same services |
| M9 Comms and audit | Implemented | Announcements, notifications, `notify`, audit read. Leave and payroll write audit rows | AI logs |

Business rules stay in `src/services/`. Routes and controllers should stay thin so the AI tools can call the same functions later.
