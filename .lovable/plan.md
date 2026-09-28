# Talk Channels staff list

## Goal
Replace the current Staff card area in Talk Channels with a compact staff directory matching the Members tab layout.

## Behaviour
- Keep the existing top-level **Staff** and **Members** tabs.
- The **Staff** tab gets its own **Online** and **Offline** tabs with count pills.
- Only show staff who are allowed to view the channel currently open.
- **Online** means the staff member currently has that exact Talk Channel open; otherwise they appear under **Offline**.
- Each staff row keeps the avatar, name, role colour, and profile popover used by the member list.
- Show working state below the role:
  - **Working** with the live elapsed shift time.
  - Active break type with a live remaining countdown; once overdue, show the overrun time.
  - **Off duty** when no shift is active.
- Away / DND remains visible and takes priority over the green online indicator.
- Welcome and Rules channels, which currently show only staff, use the same new staff list.

## Scope and safety
- Change only the Talk Channels sidebar presentation in `StaffOnDutyStrip` / its sidebar entry point.
- Keep the existing card-style staff display everywhere else, including tickets and other staff areas.
- Reuse the existing channel presence, channel access, shifts, breaks, DND, role colours, and profile popovers.
- Do not change the shared presence engine, global Talk Channel counters, Members tab counting logic, or ticket-channel code.

## Verification
- Open a Talk Channel and confirm Staff Online/Offline tabs show the correct channel-specific people and counts.
- Confirm working, off-duty, break countdown, overdue break, and Away states display correctly.
- Switch channels and confirm the staff list follows each channel's access and live presence.
- Confirm the Members tab and global chat badges remain unchanged.
- Confirm ticket staff cards retain their current design.
