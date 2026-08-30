# Off-duty staff show as online when they're in the chatroom

## Goal
A staff member who is in the talk channels but hasn't clocked in stays in the **Off duty** card list, but their card shows a green presence dot and a status line saying they're in the chat — not that they're working.

## Behaviour
- Off-duty card, user present in talk channels: green dot, status line "In chat · off duty", avatar no longer greyed out.
- Off-duty card, user not present: unchanged (grey dot, "Off duty", greyed avatar).
- DND still wins: purple dot and the DND badge/message keep their current priority.
- On-duty cards and the Owner (Dane J) card are unaffected; nobody moves between the on-duty and off-duty groups, and the on-duty count stays based on clocked-in shifts only.

## Technical notes
- `src/hooks/use-talk-channel-presence.tsx` currently only publishes a unique-user *count*. Extend it to also expose the set of present user IDs (e.g. a `useTalkChannelPresentUsers()` export sharing the same channel/listener plumbing) without changing the existing count API or the `track` behaviour.
- `src/components/app/StaffOnDutyStrip.tsx`: in `renderOffDutyCard`, read that presence set and derive `inChat = presentIds.has(p.id)`; use it to pick dot colour, avatar opacity/grayscale, and the status line. Also feed `isOnline` for the mini profile.
- Presentation-only change; no schema, RLS, or shift logic changes.

## Verification
- Open a talk channel as a staff account that is not clocked in: their off-duty card shows the green dot and "In chat · off duty".
- Leave the chat: card reverts to grey "Off duty" without a reload.
