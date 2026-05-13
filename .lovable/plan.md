
# Discord-Inspired Community App — Build Plan

A full Discord-style app with its own visual identity, Lovable Cloud backend, role-based access, and the requested staff/community systems.

## Design direction
- Dark theme, deep slate background, single bold accent (teal/cyan, not Discord blurple) so it reads as "inspired by, not a clone".
- Layout language stays familiar: left **icon rail** (servers/sections), channel list, main content, optional right panel (members/details).
- Display font: Space Grotesk. Body: Inter. Rounded squares for icon rail (12px radius). Subtle glow on active item.
- All colors via semantic tokens in `src/styles.css` (oklch).

## Roles
Stored in a separate `user_roles` table with a `has_role()` security-definer function (avoids RLS recursion).
Roles: `admin`, `management`, `staff`, `moderator`, `member`, `pending` (default for new signups awaiting gate approval).

## Milestones

### M1 — Foundation
- Enable Lovable Cloud
- Auth: email/password + Google
- DB: `profiles`, `user_roles`, `app_role` enum, `has_role()` function, RLS policies
- Sign up creates profile with `pending` role via trigger
- Shell layout: icon sidebar, channel column, main area, route guards

### M2 — Security gate (chat with moderator)
- New `pending` users land on a private "gate" channel
- Realtime chat (one room per pending user, only that user + moderators/admins can see)
- Moderator review queue with **Approve** (promotes to `member`) / **Deny** buttons
- Approved users gain access to the rest of the server

### M3 — Discord-style channels & chat
- Text channels with realtime messages, member presence, basic markdown
- Channel categories: General, Staff Only, Announcements
- Channel visibility gated by role

### M4 — Tickets system
- Users open support tickets (subject, category, message)
- Ticket = private channel between user + assigned staff/moderator
- Statuses: open, in-progress, closed
- Staff/admin queue view with filters

### M5 — Shop
- Product catalog (name, description, price, image, stock)
- Cart + checkout (orders table, status tracked)
- Admin-only product management UI
- Payment provider hookup is a follow-up (will recommend Stripe when you're ready)

### M6 — Install guides (block-based with read tracking)
- Guides composed of **blocks** (steps): text, code, image, callout
- Each block has a "Mark as read" toggle per user
- Progress bar + completion status per guide
- Admin/management can author guides via a block editor

### M7 — Sports guides (PDF)
- Upload PDFs to Cloud Storage (private bucket)
- List view with title, sport, thumbnail
- In-app PDF viewer
- Admin/management upload, all members read

### M8 — Staff time clock
- Clock In / Clock Out with timestamps
- Break Start / Break End (multiple breaks per shift)
- Live "on shift" indicator, total hours today/week
- Personal timesheet history; admin/management can view all staff

### M9 — Shift system
- Management posts shift slots (date, time, role needed, count)
- Staff browse open shifts and **apply**
- Management approves/denies applications
- Approved shifts appear on staff schedule and feed into the clock

## Technical notes (for reference)
- TanStack Start + file routes under `src/routes/`
- All server logic via `createServerFn` with `requireSupabaseAuth`; storage uploads via signed URLs
- `_authenticated/` layout for logged-in routes; `_authenticated/_approved/` sub-layout for non-pending users; `_authenticated/_staff/` for staff areas
- Realtime via Supabase channels for chat, tickets, presence
- RLS on every table; admin actions go through `has_role()` checks
- PDF rendering via `react-pdf`

## What I'll do now
If you approve this plan, I'll start with **M1 (foundation + auth + roles + shell)** and **M2 (security gate)** in this turn so you have a working approval flow end-to-end. Then I'll continue through the remaining milestones in subsequent turns, checking in after each major milestone so you can steer.

Tell me if you want to reorder, drop, or expand any milestone before I start.
