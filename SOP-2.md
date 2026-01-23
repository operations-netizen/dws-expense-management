# SOP — Role Playbooks (Plain English)

Quick, non-technical instructions for each role. Use the same login, but your menu and actions differ by role.

## Super Admin (reference)
- Goal: Own the entire system across all business units.
- You can: Create/edit/deactivate any user; add/edit/delete any expense; bulk upload; export; view all logs; see duplicate vs unique and shared splits.
- Daily moves: Keep users current; review expense sheet (filter duplicates/merged/shared); run exports; scan logs for disable/cancel; watch auto-cancel notices.
- Notifications: Gets disable/cancel and auto-cancel notices; sees everything in logs.

## MIS — Expense Manager
- Goal: Keep data clean and finance-ready across all BUs.
- You can: Add/edit expenses (auto-approved), bulk upload, export with duplicate status, mark services Deactive, view all logs, filter duplicates vs unique, view shared splits.
- Daily moves: Upload statements via Bulk Upload (check merged/unique counts); fix incorrect rows; deactivate entries when Service Handlers request cancel; verify renewal reminders and auto-cancel notices were handled; export filtered sheets for finance.
- Notifications: Gets accepted-entry notices; renewal responses (continue/cancel); disable/cancel requests; auto-cancel notices when handlers do not respond.
- Filters to use: BU, status, recurrence, handler, type, cost center, approver, shared-only, duplicate status (Unique/Merged), amount/date/disable-date ranges.

## Business Unit Admin
- Goal: Oversee expenses and users for your BU.
- You can: Add SPOC and Service Handler for your BU; add expenses for your BU (auto-approved); view your BU sheet; see BU logs and shared splits affecting your BU.
- Daily moves: Acknowledge new SPOC entries; keep BU users up to date; monitor BU spend with filters (status/recurrence/shared/handler); review renewal responses and cancel requests for your BU.
- Notifications: Informed when your BU’s SPOC logs an entry; informed on Service Handler renewal responses (continue/cancel) for your BU; sees related log entries.

## Business Unit SPOC
- Goal: Capture day-to-day expenses for your BU.
- You can: Add expenses for your BU; mark shared splits; view your BU sheet and your entry statuses.
- Daily moves: Log each purchase immediately with card/date/amount/currency/recurrence/handler; mark Shared and splits if multiple BUs pay; check sheet for Accepted/Rejected and fix/re-submit if needed.
- Notifications: See status changes in the sheet; rely on BU Admin/MIS for follow-up if something looks wrong.

## Service Handler
- Goal: Own assigned services and signal renewals or cancellations.
- You can: See My Services (only yours); respond to renewal reminders (continue or cancel); request disable/cancel.
- Daily moves: When a reminder arrives (5 days before renewal), choose Continue or Cancel; if canceling, submit a disable request after you’ve cancelled with the vendor; confirm status is updated after MIS/Super Admin marks Deactive.
- Notifications: Renewal reminders; confirmations for disable/renewal actions; possible auto-cancel notices if you do not respond before renewal.