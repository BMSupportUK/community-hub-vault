## Boro Fan Zone — gated community area

A dedicated section in the sidebar for Middlesbrough F.C. supporters. Members request access; admins/management approve. Approved fans get a small set of themed channels.

### Channels in the zone
Grouped under a new category **"Boro Fan Zone"** (Trophy / shield icon):
- **#boro-general** — banter & general chat
- **#match-day** — live match thread channel
- **#transfers-rumours** — gossip / news
- **#highlights** — clips, photos, memes
- **#fixtures-results** — pinned upcoming fixtures + results recap

These reuse the existing `chat_channels` table and channel UI — no new chat code.

### Access model

A new lightweight membership table gates visibility — independent of the existing role system so non-staff fans can join without being elevated to `staff`.

```text
fan_zone_members
  user_id      uuid pk → auth user
  status       enum('pending','approved','rejected','revoked')
  requested_at timestamptz
  decided_at   timestamptz null
  decided_by   uuid null
  reason       text null       -- optional message from requester
  note         text null       -- admin note on decision
```

A SECURITY DEFINER helper `is_fan_zone_member(uuid)` returns true when `status = 'approved'`. The fan-zone channels get a new `requires_fan_zone boolean` flag on `chat_channels`; `can_in_channel()` is extended so visibility/send checks also require `is_fan_zone_member(auth.uid())` when that flag is set. Admins/management bypass as today.

### Request flow
1. Any approved user sees a **"Boro Fan Zone"** card in the sidebar with a Trophy icon and a "Request access" button (if not yet a member).
2. Clicking it opens a dialog: short optional message → inserts a `pending` row.
3. State chips reflect status: **Pending review**, **Approved** (channels appear), **Rejected** (with optional reason), **Revoked**.
4. Admins/management get a new admin page **"Fan Zone Requests"** (under existing admin area) listing pending requests with Approve / Reject / Revoke actions. Realtime updates so the sidebar flips to showing the channels as soon as approval lands.

### Sidebar behaviour
- Non-member: shows a single locked card with the request CTA.
- Pending: shows a muted "Awaiting approval" card.
- Approved: the **Boro Fan Zone** group renders in the channel list with its 5 channels, same as any other category.
- Admin/management: always sees the zone (bypass) plus a small badge on the admin nav when pending requests exist.

### Optional polish (in scope)
- Welcome embed seeded on **#boro-general** ("Up the Boro 🦁 — be civil, no spoilers in match-day until full time").
- Slow-mode tuned per channel (match-day → 5s; others → 30s default).
- Fixture/result pinning is just a normal pinned message — no new infra.

### Out of scope
- Pulling live fixtures from an external API.
- A separate "fan profile" with kit numbers, etc.
- Notifications routing changes beyond the existing mention/notify pipeline.

### Implementation outline (technical)

1. **Migration**
   - Add `fan_zone_members` table + grants + RLS (user reads own row; admin/management read/write all; user inserts own pending row).
   - Add `requires_fan_zone boolean default false` to `chat_channels`.
   - Create `is_fan_zone_member(uuid)` SECURITY DEFINER, listed in the SECURITY DEFINER allowlist memory.
   - Replace `can_in_channel()` body to AND in the fan-zone check when the flag is set.
   - Seed the category + 5 channels with `requires_fan_zone = true`, `group_label = 'Boro Fan Zone'`.
   - Add fan-zone channels & members table to `supabase_realtime` publication.

2. **Frontend**
   - New `useFanZoneMembership()` hook (realtime on own row).
   - New `FanZoneAccessCard.tsx` in `HomeChannelsSidebar` footer (states: locked / pending / approved-hidden).
   - New `FanZoneRequestDialog.tsx` (textarea + submit).
   - Group rendering already works via `group_label`; just ensure category icon mapping picks a Trophy/shield for "Boro Fan Zone".
   - New admin page `src/routes/_authenticated/_approved/admin/fan-zone.tsx` listing requests with Approve / Reject / Revoke and small filter tabs.
   - Add a nav entry under existing admin section with a count badge of pending requests.

3. **Permission wiring**
   - `chat_channels` SELECT policy already calls `can_in_channel(... 'view')` — updating that function is enough to hide the channels from non-members.
   - Same for `chat_messages` SELECT/INSERT — flows through `can_in_channel`.

### Files touched
- `supabase/migrations/<new>.sql` (table, function update, channel seed)
- `src/hooks/use-fan-zone.tsx` (new)
- `src/components/app/FanZoneAccessCard.tsx` (new)
- `src/components/app/FanZoneRequestDialog.tsx` (new)
- `src/components/app/HomeChannelsSidebar.tsx` (mount the card)
- `src/routes/_authenticated/_approved/admin/fan-zone.tsx` (new admin page)
- Admin nav component (add link + pending badge)
- `src/integrations/supabase/types.ts` (auto-regenerated)
