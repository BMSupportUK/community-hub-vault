# Portal home refresh: big banner and sidebar

Keeps the current layout (picture on the left, sidebar on the right, four boxes along the bottom) and makes it livelier for both portals.

## Changes
- **Greeting over the picture:** "Good morning / Good afternoon / Good evening, {name}" plus the welcome line, placed over the bottom of the picture on a soft dark fade. It uses UK office time.
- **Picture changes with the time of day:** a lighter, warmer filter in the morning, normal in the afternoon, a cooler, dimmer one in the evening. Same pictures as now (office scene for staff, member picture for customers).
- **Sidebar order:** status pills, then Hey + nameplate + role badge, then a new **live counters** row, then Working Status (staff) or the subscription box (customers). The welcome heading moves onto the picture, so the sidebar gets shorter.
- **Live counters (each one opens its page):**
  - Staff: open tickets, unread inbox, people in Talk, shop orders waiting (admin and management only).
  - Customers: open tickets, unread inbox, people in Talk, orders waiting for payment.
- Expert Support / Service Status cards and the four bottom boxes stay where they are, and the page still fits the browser height.

## Unchanged
- Working Status and subscription box contents, the portal headers, the side rail, the unlock and countdown. Talk and ticket code is not touched; the counters only read numbers.

## Technical details
- Only `src/components/app/PortalHome.tsx` changes, plus a small `src/lib/greeting.ts` (UK-hour greeting and time-of-day band) with a `bun test` file covering 05–11:59 morning, 12–17:59 afternoon, and evening otherwise.
- Counters reuse the existing hooks (`useTalkChannelTotalCount`, the inbox unread count) and use RLS-scoped count queries for tickets and orders. Nothing new in the database.
- I'll check it on screen as staff and as a member, on desktop and phone width.
