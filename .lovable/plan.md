## Goal
Let **admin** and **management** users set a **Do Not Disturb** status with start/end times. While active, a DND badge appears wherever their name/avatar renders so teammates know not to ping them.

## Database (new migration)
Table `user_dnd_status`:
- `user_id uuid primary key`
- `enabled boolean not null default false`
- `starts_at timestamptz null` (null = now)
- `ends_at timestamptz null` (null = until manually turned off)
- `note text null` (≤140 chars)
- `updated_at timestamptz not null default now()` (trigger to keep fresh)

Grants + RLS:
- `GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_dnd_status TO authenticated`
- `GRANT ALL ON public.user_dnd_status TO service_role`
- Read policy: any approved (not pending/banned) authenticated user can `SELECT`.
- Write policies (INSERT/UPDATE/DELETE): `user_id = auth.uid() AND has_any_role(auth.uid(), ARRAY['admin','management']::app_role[])`.
- Add table to `supabase_realtime` publication.

Helper SQL function `public.is_user_dnd(uuid) returns boolean` — true when `enabled` AND `now()` ∈ `[coalesce(starts_at, '-infinity'), coalesce(ends_at, 'infinity')]`.

## UI

### `src/components/app/DndStatusBox.tsx` (new)
- Rendered in `HomeChannelsSidebar` directly below `WorkingStatusBox`, only when current user has `admin` or `management` role.
- Compact card "Do Not Disturb":
  - On/Off `Switch` (shadcn).
  - Start + End time inputs (`<input type="time">`) with "Today / Tomorrow" toggle for end date.
  - Optional note (`Input`, max 140).
  - Quick presets: 30 min · 1 hr · Until end of day · Custom.
  - Live countdown ("Ends in 42m") using 1s `setInterval` pattern from `MyWorkingStatus`.
  - Save → upsert to `user_dnd_status` keyed on `user_id`.

### `src/components/app/DndBadge.tsx` (new)
- Small violet pill: `Moon` icon + "DND" label, tooltip shows note + remaining time.
- Accepts `userId` prop; uses shared hook below.

### `src/hooks/use-dnd.tsx` (new)
- `useDndStatus(userIds: string[])` — returns `Map<userId, { active, endsAt?, note? }>`.
- One shared realtime channel for the page; 60s tick to roll over time windows.

### Edits to surface the badge
- `MyWorkingStatus.tsx` — show DND pill when current user is DND (alongside working pill).
- `Nameplate.tsx` — append `<DndBadge userId>` after the name (covers chat senders, members directory, profile cards).
- `StaffOnDutyStrip.tsx` — overlay small DND dot on staff avatars when active.

## Files touched
- Migration (new)
- `src/components/app/DndStatusBox.tsx` (new)
- `src/components/app/DndBadge.tsx` (new)
- `src/hooks/use-dnd.tsx` (new)
- `src/components/app/HomeChannelsSidebar.tsx`
- `src/components/app/MyWorkingStatus.tsx`
- `src/components/app/Nameplate.tsx`
- `src/components/app/StaffOnDutyStrip.tsx`
- Auto-updated: `src/integrations/supabase/types.ts`, `src/routeTree.gen.ts`

## Out of scope
- Suppressing push notifications while DND is on (visual-only for now; trivial follow-up in `push.functions.ts`).
- Recurring schedules.
- DND for non-admin/non-management roles.
