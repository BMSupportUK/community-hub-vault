# Talk channels: unclaimed ticket badge + private staff messages

## Part 1 – Unclaimed tickets on the staff ticket icon
- Remove the small "tickets waiting to be claimed" card in the Talk channel corner. The red bar on other pages stays.
- The ticket icon next to each staff name flashes red with a number showing how many tickets are unclaimed. It updates live and stops flashing when the count reaches 0.
- Clicking it opens the existing ticket popup, where staff press **Claim ticket** and then **Go to ticket**.
- The sound and browser alert for new tickets still play for staff on shift.
- Technical: `UnclaimedTicketsNotifier` returns nothing on Talk routes. `StaffTicketsButton` gets one shared live unclaimed count (a single subscription used by all icons), with a pulsing destructive badge.

## Part 2 – Private messages posted in the Talk room (command-based)

## What users will see
- Any member can post a private message in the normal Talk room by starting it with the command **/private** (short form **/p**), for example: `/private my account email is ...`.
- The command is removed before posting. The message appears in the room timeline, but only the sender and staff can read it.
- While the message box starts with the command, it turns amber and shows a hint: "Private – only you and staff will see this". Typing `/` suggests the command.
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
  - detect a leading `/private ` or `/p ` in the composer, strip it, and send with `private_to`
  - the amber badge and styling on private messages
  - the staff "Reply privately" action, which sets reply_to and `private_to` to the original member
  - mention/notification previews skip private content for non-staff
- The Talk channel code is normally locked; this change is limited to the pieces listed above.
- Test with two accounts (a member and staff): the member's private message is seen by staff and not by a second member, and the staff private reply is seen only by that member.
