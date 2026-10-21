# Staff Portal home: same layout as the Customer Portal

Give the Staff Portal home the same arrangement members already have, so both portals look alike.

## Staff Portal home after the change
- **Left column:** the office picture fills the whole column, like the member picture does. The greeting row and welcome text under it are removed.
- **Right sidebar, in this order (same as members):**
  1. Status icons: Office Time / Your Time clocks, Lock now, 2FA, VPN
  2. "Hey" + staff nameplate + role badge (Admin, Staff, Management and so on), in the same style as the member "Hey" + nameplate + MEMBER row
  3. "Welcome to The Staff Portal" heading with the shift message under it ("Have a great shift…" / "See you on your next shift…"), at the same size as the member heading
  4. Working Status box, in the spot where members have the subscription box
- Expert Support and Service Status cards under the picture stay as they are.

## Unchanged
- The Customer Portal home layout.
- Working Status content and buttons, and the shift message wording.

## Technical details
- `src/components/app/PortalHome.tsx` only: drop the staff-only greeting block in the left column and the `aspect-[21/9]`/`self-start` staff branches so the image uses `flex-1` for everyone. Build one shared sidebar header (GreetingPills, Hey + Nameplate + badge, h1 + message) that takes a label and message per role, then render `WorkingStatusBox` (staff) or `SubscriptionDetailsCard` (member) beneath it.
- Staff nameplate uses the same `Nameplate` component with the staff member's own official plate id (nameplates for staff stay official-only).
- Check it as the owner and as a member, on desktop and phone width.
