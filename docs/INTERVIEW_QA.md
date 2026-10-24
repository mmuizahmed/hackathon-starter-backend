# Interview questions

Short answers a student can say out loud. They match this API. The longer map is [BACKEND_GUIDE.md](BACKEND_GUIDE.md).

## 1. Walk me through one request.

The browser calls `/api` on the Vercel site. Vercel rewrites that to the Render API, so the cookie stays first-party. Express reads the `token` cookie, loads that user from MongoDB, and checks the role. The route calls a thin controller. The controller calls one service. The service applies the business rule and uses a Mongoose model. The response is `{ success, data }` or `{ success: false, message }`.

## 2. Why rewrite `/api` instead of calling Render from the browser?

The login cookie has to be first-party. If the page on Vercel called Render directly, the cookie would be third-party and browsers would block it. The rewrite makes `/api` look like the same site. Locally, Vite proxies `/api` to port 5000 for the same reason.

## 3. Why is the token in an httpOnly cookie?

JavaScript on the page cannot read it, so a copied script cannot steal the session the way it can steal `localStorage`. The JSON login body does not include the token. The cookie is `SameSite=Lax`, and in production it is `Secure`. It lasts seven days.

## 4. Why do you load the user again on every request?

The token only says who signed in. Role, `active`, and `mustChangePassword` can change while the token is still valid. Those fields come from the database. A bad cookie just means "not logged in". The API does not trust an `Authorization` header.

## 5. How do Admin, HR, and Employee differ?

Admin manages settings and is the only role that finalizes payroll and reads the audit log. HR manages employees, approves leave and corrections, and builds the payroll draft. An employee checks in, requests leave, and sees their own rows. The route has `requireRole`. The service checks again, because the assistant calls the service directly and does not go through the route.

## 6. How do you stop an employee opening someone else's payslip?

The login id and the employee id are different fields. `User.employee` points at the employee row. `assertOwnEmployee` compares that employee id with the row. Admin and HR skip the check. A colleague's payslip or PDF returns 403, "You can only access your own records". The same helper covers attendance and leave.

## 7. What does a temporary password block?

HR creates a person with a one-time password and `mustChangePassword` set. Until they change it, the only open paths are health, setup, login, logout, me, and change password. Everything else is 403 "Password change required". The check sits in one middleware, so a new route is covered too.

## 8. Why MongoDB?

The payslip stores a breakdown document: inputs, each line, and the tax formula. The audit log stores `before` and `after` as JSON. Those fit a document database without a pile of extra tables. Mongoose still gives us required fields and indexes, such as one attendance row per employee per day. Judges can start from an empty database. There is no seed.

## 9. Why are dates strings instead of timestamps?

A calendar day in Karachi must not move when the server is in UTC. Pakistan is UTC+5 all year. `joinDate`, attendance `date`, and leave dates are `YYYY-MM-DD`. Check-in and check-out are real timestamps, and the server sets them. The browser does not send the clock.

## 10. Why is 09:15 present and 09:16 late?

Late means strictly after office start plus grace. With 09:00 and 15 minutes, 09:15 is still inside the window. 09:16 is one minute past it. The comparison uses the Karachi wall clock converted to UTC. Saving settings later does not rewrite rows that were already marked late.

## 11. Can a half day also be late?

Yes. If the person arrived late and left before five hours, the status is `half_day` and `late` stays true. Payroll can deduct the half day and, if the late penalty is turned on, also count that arrival toward the late rule. Those are two different rules: hours worked, and how often they were late. The late penalty is off unless Admin enables it.

## 12. What if someone checks in on Saturday?

Check-in is allowed. The punches are stored, but the status is `present` and `late` is false. A one-hour visit is not a half day. Payroll only walks working days, so that row is not a deduction. The same rule applies on a holiday, including a tentative one.

## 13. How do you count leave days?

`countWorkingDays` drops the company weekend and every holiday. Friday to Monday, with Monday as a holiday, is 1 day, not 4. The server stores that number. The client cannot send a day count. A range that is only weekend and holidays is 422.

## 14. Why can two pending requests both fit the quota?

Pending does not reserve the balance. Each request is allowed if it fits the approved remainder. Approve checks again. The second approval is 422 if the first one used the days. The HR inbox shows the balance before this request and after it, plus colleagues in the same department who are already approved on those dates. Employees do not see that block, because it names other people.

## 15. Walk through one payslip.

Eva's basic is 100,000. HR did not type allowances, so HRA is 40,000 and medical is 10,000. Gross is 150,000. October 2026 has 22 working days with a Saturday-Sunday weekend and no holiday. Per day is 150,000 / 22 = 6,818.18. She is absent one working day. That line is 6,818.18. The gross on the slip stays 150,000. The absence is a deduction, not a smaller gross.

Annual gross is 150,000 times 12 = 1,800,000. That slab is 30,000 plus 15% of the amount above 1,200,000. 15% of 600,000 is 90,000. Annual tax is 120,000. Monthly tax is 10,000. Net is 150,000 minus 6,818.18 minus 10,000 = 133,181.82. The slip stores those lines so the PDF and the assistant do not recalculate them later.

## 16. Why doesn't one absence lower the tax?

The slab is on the monthly structure times 12. Absence is a deduction from pay, not a change of salary. A joiner is different: their tax is scaled by employed working days over the month's working days, because they were not on that structure all month.

## 17. What changes when someone joins on 15 October?

October still has 22 working days. If they are employed for 12 of them, gross on the slip is 6,818.18 times 12 = 81,818.16. Tax starts from the full-month 10,000 and is scaled by 12/22, which is 5,454.55. Days before they joined are not absences. The structure that covers 31 October is the one this run uses, so a raise dated 1 November does not change October.

## 18. Why can HR prepare payroll but not lock it?

The brief says only Admin finalizes. The route and the service both require `admin`. HR gets 403. After `finalized`, generating that month again returns 409, so the numbers cannot move after people have been notified. If checks are still open, Admin gets 422 unless they send `override: true` and a reason. That reason is written on the audit row.

## 19. How does the assistant call tools?

`POST /api/ai/chat` sends the system prompt and the user's messages to the model. If the model returns tool calls, the server runs at most four of them, for at most three rounds. The tools are headcount, attendance summary, late comers, leave summary, my leave balance, payroll summary, and employee search. Each one calls the same service the REST route uses, with the signed-in user. The answer includes `sources`, `tools`, `aiGenerated: true`, and the label "AI-generated". Smart leave returns JSON for the form and does not save a request. Explain-payslip loads the slip with `getPayslip` first.

## 20. Why can't the assistant tell me a colleague's salary?

If the tool arguments include an employee id, `assertOwnEmployee` runs before any payslip or salary is read. For an employee asking about someone else, the tool result is `{ refused: true, message: "You can only access your own records" }`. That sentence is what the model sees. The hidden number is never loaded, so it cannot leak into the prompt. The prompt also says to stop, but the prompt is not the lock. The code is.

## 21. What if the AI key is empty, or the model is slow?

The API still boots. The user gets HTTP 200 with a short fallback sentence, such as "The assistant is not configured yet" or "The assistant took too long." A 403 or 429 is still a real error. The 429 message is "Too many AI requests. Try again in an hour." Every call, including failures, is a row in `aiLogs`. The default host is Gemini's OpenAI-compatible endpoint, model `gemini-2.5-flash`. The key never goes to the browser.

## 22. How is this deployed?

The React app is on Vercel. The API is a Render web service: `npm ci`, then `node src/server.js`, health check `/api/health`. Render has `MONGODB_URI`, `JWT_SECRET`, `CLIENT_URL` set to the Vercel origin, and `AI_API_KEY`. `NODE_ENV` is production, so the cookie is `Secure` and a 500 does not return a stack. Leave `ADMIN_EMAIL` empty so judges use the setup screen.

## 23. How does a judge create the first admin, and why is there no seed?

They open the app. The setup wizard calls `POST /api/setup` once. That creates the company, four leave quotas, and one admin, and sets the cookie. There are no sample employees. A second setup returns 409. The smoke script does create data, so the database has to be dropped afterwards if the wizard must be empty again.

## 24. What does the audit log guarantee?

Services call `recordAudit`. Admin can read `GET /api/audit`. There is no update or delete route, and the schema throws if code tries to change a row. Snapshots do not include password hashes. A payroll override stores the reason on that audit row.

## 25. What would you improve next?

I would add a real camera screen, or drop the camera fields until there is one, so nobody thinks face check-in is finished. I would add the mobile app the brief mentioned. I would paginate the heavier analytics loops instead of walking every person in the process. I would add a job for the AI call so a slow model cannot hold a web request. I would keep the payroll formula where it is, in `payrollMath.js`, because that part is already easy to test without the database.
