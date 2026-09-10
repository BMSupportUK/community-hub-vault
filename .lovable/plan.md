# Per-channel staff strip and member list in Talk Channels

## Goal
When you're viewing a talk channel, the side rail's **Staff** and **Members** tabs show only the people who have access to *that* channel, and a green online dot means the person is *in that channel right now* — not just somewhere in Talk Channels.

## Behaviour
- Switch channels and both lists change to match that channel's access list.
- Green dot / online grouping = the person currently has that channel open. Someone in a different room shows as offline in this one.
- Staff tab keeps its current card style (on-duty strip); it just filters to staff who can view this channel, and "in chat" presence reflects this channel.
- Members tab keeps its online/offline sections, search-free list, role colours and profile popover — but scoped to members with access to the channel.
- The existing global counters elsewhere (side rail badge, "N in chat" pill) are untouched.

## Technical notes
1. **New DB function** `talk_channel_member_directory_for_channel(_channel uuid)` (migration):
   - Same columns as `talk_channel_member_directory()`, plus a `WHERE public.can_in_channel(p.id, _channel, 'view')` filter so the list exactly matches who can see the channel (handles role permissions, admin/management override, staff-only and fan-zone-gated channels automatically).
   - `SECURITY DEFINER`, `GRANT EXECUTE TO authenticated` only.
2. **Presence** (`src/hooks/use-talk-channel-presence.tsx` — locked file; this request is the authorisation, change is strictly additive):
   - Tracked presence payloads already carry `channel_id`; add a new exported hook `useTalkChannelPresentUsersInChannel(channelId)` that buckets the existing live presence scan by channel and returns the set for the requested channel.
   - No changes to existing count/linger/track logic or the global hooks used by the rail badge and pills.
3. **`TalkChannelMembersPanel`**: accepts a `channelId` prop; loads the new RPC and uses the per-channel presence set for online/offline grouping and the header count.
4. **`StaffOnDutyStrip` / `StaffOnDutySidebar`**: optional `channelId` prop; when set, filter the staff list to IDs returned by the new RPC and use per-channel presence for the "in chat" indicators. Tickets/clock pages pass nothing and are unchanged.
5. **`home.$channel.tsx`**: pass the current channel's id into both side-rail tabs.

## Verification
- `bunx tsgo --noEmit` passes; `/tmp/observability/build-errors.log` shows build OK.
- Signed-in preview check: open a members channel and a staff-only channel; confirm each list only shows people with access, and a second test session in a different channel shows as offline in this one.
