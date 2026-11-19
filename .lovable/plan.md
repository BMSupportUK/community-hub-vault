# Tidier Staff Portal: side menu vs header

## What's repeated today
- **Home** is in both the header and the side menu.
- **Shop Orders** and **Customers** (side menu) open the Admin Panel, which also has its own header button.
- **Shifts** also appears as an icon in the Working Status box shown in the Talk header.
- Shifts, Shift history and Staff PIN sit as three separate side icons for one topic.

## The idea: one job per area
**Header = tools and places you jump to** (top bar, left to right)
- Home - Shop - Download App & Install guides - Admin Panel - BM Player Admin - TV Remote - Settings
- Unchanged apart from nothing being duplicated in the side menu.

**Side menu = your daily work**, grouped with thin dividers:
1. **Work:** Tickets, Talk, Access Requests (admin)
2. **My shift:** one "My shift" icon that opens a small pop-out with Shifts, Shift history and Staff PIN
3. **People:** Members, Staff, Customers (admin)
4. **Sales:** Shop Orders (admin), Link Device
5. **Community:** Sports guides, BM Support jobs, Boro Fan Zone

**Removed duplicates**
- Home leaves the side menu (logo/header Home does it).
- Shifts icon leaves the Working Status box in the Talk header.
- Shop Orders and Customers stay in the side menu as shortcuts with their badges, but the Admin Panel no longer needs a separate tool card for them.

## Kept as is
- Owner Tools saved ordering still works (within each group).
- Phone floating menu shows the same groups.
- Badges (pending orders, access requests, Talk online) unchanged.

## Technical details
- `IconRail.tsx` staff list: drop Home, add group dividers, replace three shift items with one popover item.
- `rail-order.ts`: add group keys; saved order applied per group; old saved IDs mapped to new ones.
- Remove `/shifts` link from WorkingStatusBox header variant.
