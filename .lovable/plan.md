# Private "staff only" messages in Talk channels

## What users will see
- The message box in every Talk channel gets a **lock toggle**: "Private – only staff can see". While it's on, the box turns amber and the Send button reads "Send privately".
- A private message shows in the channel with an amber lock badge: "Private – only you and staff". Other members never see it at all, not even as a placeholder.
- **Staff** see every private message, marked "Private from <name>". Each one has a **Reply privately** button, so the staff reply is seen only by that member and staff.
- Replies stay in the same channel and timeline, so the conversation reads naturally for the member and for staff.
- Editing, deleting and reactions work as they do now. Private messages can't be pinned, so nothing private ends up in the pinned list.
- On-shift staff get the normal mention sound when a member sends a private message. This means private requests aren't missed.

## Who counts as staff
Admin, management and staff roles. Moderators are **not** included, because private messages may contain account or payment details. Say if moderators should be able to see them too.

## Security
Hiding is enforced by the database, not just the screen. Other members' apps never receive private messages, including live updates, search and notifications.

## Technical details
- Migration: add nullable `private_to uuid` (the member the private thread belongs to) to `chat_messages`, with an index.
- Replace the SELECT policy "messages read channel" with: `can_in_channel(view) AND (private_to IS NULL OR private_to = auth.uid() OR sender_id = auth.uid() OR has_any_role(auth.uid(), admin/management/staff))`.
- INSERT policy: a non-staff sender may only set `private_to = auth.uid()`. Staff may set it to any member (for private replies).
- Pin UPDATE policy: disallow pinning when `private_to IS NOT NULL`.
- Realtime already respects row security, so live messages are filtered with no extra work.
- `home.$channel.tsx`:
  - composer toggle, which sends with `private_to`
  - the amber badge and styling on private messages
  - the staff "Reply privately" action, which sets reply_to and `private_to` to the original member
  - mention/notification previews skip private content for non-staff
- The Talk channel code is normally locked; this change is limited to the pieces listed above.
- Test with two accounts (a member and staff): the member's private message is seen by staff and not by a second member, and the staff private reply is seen only by that member.
