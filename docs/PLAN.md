# Module status

Judges start from an empty database. Nothing in this repo inserts sample employees.

| Module | Status | In this revision | Next |
| --- | --- | --- | --- |
| M1 Auth and access | Foundation done | Setup, login, logout, me, change password, role guard, password gate, employee scope helper | Menus are frontend |
| M2 Organization | Models only | Settings, departments, designations, leave types, holidays | CRUD routes in `docs/API.md` |
| M3 Employees | Models only | Employee and user link fields | Register, search, CSV |
| M4 Attendance | Models only | One row per employee per Karachi day | Check-in, corrections |
| M5 Leave | Models only | Requests and the four default types (created at setup, not at boot) | Apply, balance, approve |
| M6 Payroll | Models only | Salary structure, run, payslip breakdown shape | Draft, tax, PDF, finalize |
| M7 Dashboards | Not started | Formulas are in `docs/API.md` | Aggregate on the server |
| M8 AI assistant | Not started | `aiLogs` model. `AI_API_KEY` is accepted and unused | Tools must call the same services |
| M9 Comms and audit | Audit read done | `recordAudit`, admin `GET /api/audit`. Announcement and notification models | Post announcements, notifications |

Business rules stay in `src/services/`. Routes and controllers should stay thin so the AI tools can call the same functions later.
