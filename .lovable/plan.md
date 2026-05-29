## Goal
When a staff member has Do Not Disturb active, show a live countdown ("DND • 1h 23m" / "DND • 4m 12s") on every staff card so others can see at a glance how long the DND will last.

## Approach

### 1. New component: `DndCountdown`
Add `src/components/app/DndCountdown.tsx`:
- Uses the existing `useDndStatus(userId)` hook.
- Renders nothing if `!info?.active`.
- Renders nothing if there's no `endsAt` (open-ended DND — keep the existing `DndBadge` for those cases).
- Renders a small violet pill matching `DndBadge` styling: moon icon + remaining time.
- Live ticker via `setInterval(1000)` updating local state so the countdown decrements every second.
- Format:
  - `> 1h` → `1h 23m`
  - `< 1h` → `23m 12s`
  - `< 1m` → `12s`
- Tooltip shows the full end time (e.g. "Do Not Disturb until 18:45").

### 2. Wire into staff cards
- `src/components/app/StaffOnDutyStrip.tsx` — render `<DndCountdown userId={s.user_id} />` next to each staff member's name (alongside existing role-flash badge).
- `src/components/app/FanZoneStaffBox.tsx` — same, on each staff entry.
- `src/components/app/MyWorkingStatus.tsx` — replace/augment the existing `DndBadge` with `DndCountdown` so the signed-in user also sees their own countdown.

The plain `DndBadge` stays for surfaces that just need the static pill (or for indefinite DND with no end time).

## Files touched
- new: `src/components/app/DndCountdown.tsx`
- edit: `src/components/app/StaffOnDutyStrip.tsx`
- edit: `src/components/app/FanZoneStaffBox.tsx`
- edit: `src/components/app/MyWorkingStatus.tsx`

## Out of scope
- No changes to how DND is set / scheduled.
- No changes to the database or `useDndStatus` hook.
