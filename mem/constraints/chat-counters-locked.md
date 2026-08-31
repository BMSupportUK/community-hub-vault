---
name: Chat counters are locked
description: Chat/presence counters (side rail, Jump back in, Members panel) must never be changed without explicit authorisation from the user
type: constraint
---

The chat counter system is FROZEN. Do not change, refactor, restyle, rename, move, or remove any of it unless the user explicitly authorises that specific change in the current request.

Frozen surfaces:
- `src/hooks/use-talk-channel-presence.tsx` — the whole presence engine (heartbeat, linger, debounce, leave/join broadcast signals, `useTalkChannelTotalCount`, `useTalkChannelMemberCount`, `useTalkChannelPresentUsers`).
- `src/components/app/IconRail.tsx` — Customer Chatroom live count badge.
- `src/routes/_authenticated/_approved/home.index.tsx` — "N in chat" pill on the chatroom link.
- `src/components/app/TalkChannelMembersPanel.tsx` — Members panel header count and green online dots.

Rules:
- Counters must keep updating live on join/exit with no hard refresh.
- Side rail counter = total people in Talk Channels (including staff).
- Members panel / member counter = online non-staff members only.
- Do not "improve", tidy, or reformat these files as a side effect of unrelated work. If unrelated work seems to require touching them, ask first.

**Why:** These counters broke repeatedly across many turns from incidental edits and guesswork. They now work and must stay stable.
