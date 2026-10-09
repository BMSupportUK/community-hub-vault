# Inbox message settings + seasonal effects in the inbox

## 1. "Who can message me" setting
A settings button (gear icon) at the top of the BM Support Inbox opens a small panel with one choice:
- **Everyone** (default, how it works today)
- **Friends only**: only people on your friends list
- **Staff only**: only admin, management, staff and moderators
- **Nobody**: no one can start a new conversation or send you new messages

Rules:
- Admin and management can always message anyone, so support and moderation still work.
- The setting is checked when a new conversation starts and on every message sent. Changing it to a stricter option also blocks new messages in existing conversations. Old messages stay visible.
- When someone is blocked by your setting, they see "This person isn't accepting inbox messages".
- Your choice is saved to your account, so it stays the same on every device.

## 2. Seasonal effects in the inbox
- The same Halloween effects (October) and Christmas snow (December) from Talk channels also show on the inbox page, using the same UK-time dates.
- They are reused from Talk exactly: faint, never block clicks, and still only (no movement) for reduced-motion users.

## Technical details
- Migration: add `inbox_privacy text NOT NULL DEFAULT 'everyone' CHECK (inbox_privacy IN ('everyone','friends','staff','nobody'))` to `profiles`. Add a SECURITY DEFINER `bm_inbox_can_message(_sender uuid, _recipient uuid)` that returns true if the sender is admin/management, or that applies the recipient's setting. Friends means an accepted `friendships` row in either direction (exact columns to be checked before writing), and staff roles are admin/management/staff/moderator. Add `bm_inbox_set_privacy(_value text)`, a SECURITY DEFINER function where the caller can only change their own setting. Update `bm_inbox_action` 'start' and 'send' so they raise 'Recipient not accepting messages' when the check fails; every other branch stays unchanged.
- UI: gear button + popover in `src/routes/_authenticated/_approved/inbox.tsx`, with the current value read from the caller's profile. Map the error to the friendly message.
- Effects: in `src/routes/_authenticated.tsx`, render `<SeasonalEffects />` when `talkSurface || path === "/inbox"`.
- Test: a pure helper `canMessage(setting, senderRoles, isFriend)` in `src/lib/inbox-privacy.ts` that mirrors the SQL rules, with one bun test per rule (everyone, friends, staff, nobody, admin override).
- Update `mem://features/bm-support-inbox` with the privacy options.
