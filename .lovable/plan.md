# Shifts workspace overhaul

Replace the placeholder `Shifts` page with a full scheduling workspace styled in a vibrant blue scheme (mirrors the Sports Guide layout pattern).

## Tabs

1. **Welcome** — hero card explaining the workflow.
2. **Rota** — week view of the published rota. Staff/mod pick open slots; shows how many of the 3 required staff are filled per day.
3. **My shifts** — what the current user has booked, with "Request swap" action.
4. **Holidays** — request a holiday range; see status.
5. **Requests** *(admin/management only)* — approve/deny holiday requests and swap requests.
6. **Manage rota** *(admin only)* — create/edit shift slots for any day; choose role required (staff or moderator-by-the-hour).

## Roles & rules

- **admin / management** — full access, approve requests, manage rota.
- **staff** — pick whole shifts, request holidays/swaps.
- **moderator** — pick hourly slots (slot type = "hourly"); admin defines hourly slot blocks.
- Each day target = 3 filled staff slots; rota header shows `2/3 filled` per day with color (red <3, green =3).

## Database

New tables (RLS enabled, all reads gated to non-pending/banned):

- `shift_slots` — `id, shift_date date, start_time time, end_time time, slot_type ('shift'|'hourly'), assigned_to uuid null, notes`. Admin/management write; staff/mod can `UPDATE` only the `assigned_to` column to claim/release their own slot (enforced via RLS using `assigned_to = auth.uid()` for claim and old row null check via trigger).
- `holiday_requests` — `id, user_id, start_date, end_date, reason, status ('pending'|'approved'|'denied'), reviewed_by, reviewed_at`. Owner inserts/reads own; admin/management read all and update status.
- `shift_swap_requests` — `id, slot_id, requester_id, target_user_id null, message, status, reviewed_by, reviewed_at`. Requester inserts/reads own; admin/management approve and on approval the trigger swaps `assigned_to`.
- Notify admin/management via `staff_notifications` triggers on new holiday/swap request.

## Frontend

- New file `src/routes/_authenticated/_approved/shifts.tsx` (replace the `Coming` stub).
- Visual style: vibrant blue (`from-blue-600 via-sky-500 to-cyan-500` accents on a deep `[#06122e]` → `[#0b1e4a]` gradient background); reuse Tabs, Dialog, Button, Input from shadcn.
- Rota grid: 7-day strip with slot chips. Empty slot = "Claim" button (disabled if full or wrong role). Filled slot shows assignee.
- "Request swap" opens dialog selecting another claimed slot.
- Holiday tab: date range picker + list of past requests with status pill.
- Admin Requests tab: tables of pending holiday + swap requests with approve/deny.
- Manage rota tab: per-day form to add slots (date, start, end, type), list with delete.

## Out of scope (not included)

- Recurring rota templates (admin manually adds days for now).
- Calendar export, email reminders.
- Editing already-claimed slots beyond swap workflow.

Confirm and I'll create the migration + page.
