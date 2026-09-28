# Talk Channels staff list

## Goal
Replace the current Staff card area in Talk Channels with a compact staff directory matching the Members tab layout.

## Behaviour
- Keep the existing top-level **Staff** and **Members** tabs.
- The **Staff** tab gets its own **Online** and **Offline** tabs with count pills.
- Always show every admin, management, moderator, and staff account, regardless of which channel is open or which channels they can access.
- **Online** means the staff member is currently in any Talk Channel; otherwise they appear under **Offline**.
- Place each staff member’s name card directly beside their avatar, retaining their role colour and profile popover.
- Show working state below the name card:
  - **Working** with the live elapsed shift time.
  - Active break type with a live remaining countdown; once overdue, show the overrun time.
  - **Off duty** when no shift is active.
- Directly beneath working status, show the Talk Channel they currently have open; show no channel line when they are outside Talk Channels.
- Away / DND remains visible and takes priority over the green online indicator.
- Welcome and Rules channels, which currently show only staff, use the same new staff list.

## Scope and safety
- Change only the Talk Channels sidebar presentation in `StaffOnDutyStrip` / its sidebar entry point.
- Keep the existing card-style staff display everywhere else, including tickets and other staff areas.
- Reuse the existing global Talk presence, page-location tracking, shifts, breaks, DND, name cards, role colours, and profile popovers.
- Do not change the shared presence engine, global Talk Channel counters, Members tab counting logic, or ticket-channel code.

## Verification
- Open a Talk Channel and confirm Staff Online/Offline tabs always include the full staff directory with correct counts.
- Confirm working, off-duty, break countdown, overdue break, and Away states display correctly.
- Open different Talk Channels in separate sessions and confirm each online staff row names the channel that person is viewing.
- Confirm the Members tab and global chat badges remain unchanged.
- Confirm ticket staff cards retain their current design.
