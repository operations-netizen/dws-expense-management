# Expense Management Ecosystem — Complete SOP (Plain English)

This is a full, non-technical walkthrough of how the app works, every major feature, and what each role does. It also calls out all notifications, renewal reminders, duplicate handling, and shared-cost behaviors.

## 1) Purpose
- Keep all subscription/tool expenses in one place across every business unit.
- Make logging, sharing, renewals, cancellations, and audits clear and repeatable.
- Notify the right people at the right time and keep a history of every action.

## 2) Quick glossary
- Expense entry: one purchase or subscription line.
- Shared expense: one purchase split across business units with amounts per unit.
- Renewal date: the next time a subscription will charge.
- Disable/Cancel: stop a service so billing can end.
- Logs: timeline of purchases plus renewal/disable decisions and shared splits.
- Notifications: in-app and email messages about new entries, renewals, and cancels.

## 3) How the app flows (end-to-end)
1) Log in at the provided web link. Your menu shows only what your role can use.
2) Add an expense (SPOC, BU Admin, MIS, Super Admin):
   - Use Add New Entry. Fill service name, narration, card, date/month, amount + currency, business unit, cost center, approver, handler, recurrence.
   - If shared, turn on Shared and enter the split per business unit (splits cannot exceed the total). Primary BU is kept in the split list.
   - The system converts to INR automatically and sets the next renewal date based on Monthly/Yearly.
   - Duplicate protection: if the same card/date/particulars/amount/currency/BU already exists, it is marked merged instead of adding a new row.
3) Status: Entries save as Accepted for all roles (SPOC entries are informational but still accepted and notified).
4) Notifications when an entry is added:
   - BU Admins for that BU get an in-app/email notice when their SPOC logs an entry.
   - MIS gets an email/notification for accepted entries (so finance knows a new cost hit the sheet).
5) Shared expenses: Splits are saved and visible on the sheet and in logs so allocations are clear.
6) View and filter:
   - Expense Sheet filters/search: BU, status, service type, recurrence, handler, cost center, approver, shared-only, amount range, date range, disable date range, text search, duplicate status (Unique/Merged), and isShared true/false.
   - Duplicate visibility: MIS and Super Admin can filter and export duplicates vs unique; exports can include a duplicate-status column.
   - Exports: MIS and Super Admin can download the current filtered view to Excel (optionally including duplicate status and shared splits).
7) Bulk upload (MIS/Super Admin):
   - Download the template, fill rows, upload. Auto-approves inserts, detects duplicates, marks merged rows, validates shared splits, and auto-sets renewal dates and INR amounts.
8) Renewals and reminders (automated):
   - Each entry stores nextRenewalDate. A daily job sends reminders 5 days before renewal (configurable) to the Service Handler (email + in-app).
   - Service Handler clicks Continue or Cancel. The choice is logged. MIS and the BU Admin (same BU) get notifications.
   - If no response, auto-cancel notices go out 2 days before renewal to the Service Handler (if found) and MIS/Super Admin, prompting deactivation to avoid charges.
   - After a renewal date passes, the system resets the flag and rolls nextRenewalDate forward so reminders keep working.
9) Disable/Cancel requests:
   - From My Services, a Service Handler can request disable (must confirm vendor cancellation). A cancellation log is created. MIS and Super Admin are notified; BU Admin sees renewal-response cancels.
   - MIS/Super Admin mark the entry Deactive; the app stamps disabledAt and logs the action.
10) Logs (history):
   - Logs page (Super Admin, MIS, BU Admin) shows purchases, shared allocations, renewal responses, disable actions, and MIS deactivation events in one timeline.
11) Automated hygiene:
   - Rejected entries older than the configured days auto-delete nightly.
   - Exchange rates refresh daily so INR amounts stay current.
12) Role safety:
   - SPOC and BU Admin can only add/view their own BU.
   - Service Handler sees only services matching their name and BU.

## 4) Internal notification system (plain view)
- Where you see them: in-app notification center (with unread count, mark-as-read, mark-all, delete) and email for key events.
- When they fire:
  - New SPOC entry: BU Admins of that BU (in-app + email).
  - Accepted entry: MIS (in-app + email).
  - Renewal reminder (5 days before): Service Handler (in-app + email).
  - Renewal response (continue/cancel): MIS + BU Admin (same BU) (in-app).
  - Disable/Cancel request by Service Handler: MIS + Super Admin (in-app/email); BU Admin sees renewal-response cancels.
  - Auto-cancel notice (no response, 2 days before renewal): Service Handler (if found) + MIS + Super Admin (email + in-app for MIS/Super Admin).
- Why it matters: Ensures finance and approvers react quickly—book costs, stop billing, or keep services—without digging through sheets.

## 5) Renewal reminder system (plain view)
- What it does: Warns the Service Handler before renewal, and escalates if they stay silent.
- How it works:
  1) Renewal date saved from recurrence (Monthly/Yearly).
  2) Daily job sends reminders 5 days before renewal (configurable).
  3) Handler responds Continue or Cancel; the decision is logged and notifies MIS/BU Admin.
  4) If no response, 2-day auto-cancel notice goes to handler (if found), MIS, and Super Admin to push a disable before billing.
  5) After the renewal window passes, the flag resets and the next renewal date rolls forward for ongoing services.
- What it means for you:
  - Service Handler: answer reminders to avoid paying for unused tools.
  - MIS/Super Admin: act on cancels and auto-cancel notices by deactivating entries; keep logs aligned.
  - BU Admin: stay aware of BU tools being renewed or stopped.

## 6) Role-by-role guide
### Super Admin
- You can: See everything; add/edit/deactivate any user; add/edit/delete expenses; bulk upload; export; view logs; see duplicates and shared splits.
- Notifications/Emails: Gets cancel/disable and auto-cancel notices; sees all logs.
- Daily moves: Maintain users; review sheet (including duplicates/merged); run exports; check logs for disable/cancel actions; monitor auto-cancel notices.

### MIS — Expense Manager
- You can: Add/edit expenses (auto-approved); bulk upload; export; mark services Deactive; view all logs; filter/view duplicates vs unique; include duplicate status in exports.
- Notifications/Emails: Gets accepted-entry notices; renewal responses; disable/cancel requests; auto-cancel notices.
- Daily moves: Upload statements, fix data, deactivate on cancel requests/auto-cancel notices, verify renewal reminders were handled, refresh exports for finance.

### Business Unit Admin
- You can: Add SPOC/Service Handler for your BU; view your BU expenses; see your BU logs; add expenses for your BU (auto-approved).
- Notifications/Emails: Notified when your BU’s SPOC logs an entry; notified on renewal responses (continue/cancel) for your BU.
- Daily moves: Acknowledge new SPOC entries; keep BU users updated; monitor BU spend/logs and shared splits for your BU.

### Business Unit SPOC
- You can: Add expenses for your BU; mark shared splits; see status of your entries; view your BU sheet.
- Notifications: Sees statuses in the sheet; follows up with BU Admin/MIS if needed.
- Daily moves: Log purchases immediately; set shared splits correctly; check accepted/rejected; correct and resubmit if required.

### Service Handler
- You can: See My Services assigned to you; respond to renewal reminders; request disable/cancel.
- Notifications/Emails: Gets renewal reminders; disable/renewal confirmations; may get auto-cancel notices if you did not respond.
- Daily moves: Answer reminders (continue or cancel); request disable for unused services and confirm vendor cancellation.

## 7) Feature checklist (quick reference)
- Add Entry: SPOC/BU Admin/MIS/Super Admin; BU auto-locked for SPOC/BU Admin; shared splits supported; INR conversion auto; renewal date auto-set.
- Shared toggle: Split cost across BUs; total split cannot exceed main amount; primary BU retained; shown on sheet/logs/exports.
- Auto-accept: All roles’ entries are accepted immediately; SPOC entries still notify BU Admin and MIS.
- Duplicate handling: On add and bulk upload, matching entries are marked Merged; MIS/Super Admin can filter and export Unique/Merged; bulk upload reports counts of total/success/failed/merged/unique.
- Notifications: See section 4 for full matrix; notification center supports unread count, mark-as-read, mark-all, delete.
- Bulk Upload: MIS/Super Admin; flexible CSV/Excel headers; validates enums and shared splits; auto-sets renewal dates; accepts provided XE/INR or computes; auto-approves inserts.
- Filters: BU, status, recurrence, handler, type, cost center, approver, shared-only, amount range, date range, disable date range, duplicate status, text search, isShared flag.
- Exports: MIS/Super Admin; same filters as sheet; can include duplicate status and shared splits; supports date/disable-date filters.
- Renewals: Reminder 5 days before; auto-cancel notice 2 days before if no response; logs responses; rolls renewal dates forward; resets reminder flags.
- Disable/Cancel: Service Handler requests; MIS/Super Admin finalize by setting Deactive; disabledAt stamped; log created.
- Logs: Combined purchase + renewal/disable timeline with shared allocations; visible to Super Admin, MIS, BU Admin; shows MIS deactivations and handler responses.
- Service Handler view: Only their services (name + BU match); can see renewal logs for their entries; can request disable/cancel and respond to reminders.
- Hygiene jobs: Daily exchange-rate refresh; auto-delete of old rejected entries; renewal reminder/flag reset; auto-cancel notices when no response.

## 8) Weekly habits to keep data clean
- MIS/Super Admin: Export a filtered copy; scan logs for pending cancels and auto-cancel notices; clear duplicates/merged items; review shared splits.
- BU Admin: Clear new SPOC entries and renewal responses quickly; review BU logs and shared allocations.
- SPOC: Log purchases the same day; double-check shared splits.
- Service Handler: Respond to reminders; disable unused services early.

## 9) If something looks off
- Cannot log in or missing pages: ask Super Admin to confirm your role.
- Upload fails: re-download the template; ensure required columns are filled and shared splits do not exceed the total.
- Notice email missing: check spam; BU Admin can still see entries in the sheet.
- Wrong split or amount: MIS/Super Admin can edit; shared splits update together; INR recalculates automatically.
- Currency looks wrong: edit amount/currency; system refreshes INR; daily exchange-rate job keeps conversions current.

Keep this SOP as the single reference. Each role can read their section; together, it shows how every feature and notification fits into the workflow.
