# Automatic break planning for staff and management

## What staff will see
- In the Working Status box, under the Shift row: **Break 1**, **Lunch**, **Break 2** with their planned times (e.g. "Break 1 · 11:15", "Lunch · 13:30", "Break 2 · 16:00"), in Office Time plus Your Time when different.
- A used break shows as done; the next one is highlighted.
- At the planned time they get a reminder (sound + phone alert). They still tap to start it, which keeps the current auto-end timers (15 min / 30 min) and the once-lunch / twice-break limits.

## How times are picked
- Applies to staff and management on today's rota.
- Break 1 (15 min): in the first part of the shift, before lunch.
- Lunch (30 min): around the middle of the shift.
- Break 2 (15 min): in the second part, after lunch.
- Times are spread out across everyone on the same day so at least 1 person is always working. Several people can be away together only if someone is still covering.
- If someone's shift is too short or there isn't enough cover, the slot is moved to the nearest free time; if none exists it shows "No slot – ask a manager".

## Technical section
- New pure helper `src/lib/break-plan.ts`: `planBreaks(slots, minCover=1)` -> per-user {break1, lunch, break2}; 15-min step search starting from target points (1/4, 1/2, 3/4 of shift), checks overlap count vs on-shift count. Unit tests in `tests/break-plan.test.ts` (positions, cover >= 1, two-person day staggers, short shifts).
- Computed on the fly from today's `shift_slots` (slot_type 'shift', staff/management users) — no new table, so rota edits re-plan automatically.
- `WorkingStatusBox.tsx`: render the plan rows; mark taken using today's `breaks` rows.
- Reminder: add a "break due" kind to `scheduled-reminders.ts` (existing reminders path, no new cron) and an in-app toast, deduped per slot.
