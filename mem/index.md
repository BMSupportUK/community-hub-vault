# Project Memory

## Core
User emails are visible only to admin and management roles. Hide email fields from all other users in every UI surface (profiles, members directory, orders, ticket views, admin pages, etc.).
/sports-guides is FROZEN — do not modify sports-guides routes, components, or `src/lib/parse-event-times.ts` unless user explicitly requests a sports-guides change.
Chat/presence counters are LOCKED — never change the presence hook, side rail count, "in chat" pill, or Members panel count without explicit authorisation.

## Memories
- [SECURITY DEFINER allowlist](mem://security/security-definer-allowlist) — Functions that must remain executable by `authenticated`; safe to ignore lint 0029 for them
- [Sports guides frozen](mem://constraints/sports-guides-frozen) — Do not touch sports-guides routes or parser without explicit request
- [Chat counters locked](mem://constraints/chat-counters-locked) — Frozen presence engine + all chat counter surfaces, expected behaviour per counter
- [Boro team sheets locked](mem://constraints/boro-team-sheet-locked) — Frozen X team-sheet pipeline posting Boro + opposition XI into match-day threads; never narrow detection patterns
- [Page permissions](mem://features/page-permissions) — page_permissions semantics, `_approved` route guard and side-rail gating
