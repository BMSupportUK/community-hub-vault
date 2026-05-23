# Project Memory

## Core
User emails are visible only to admin and management roles. Hide email fields from all other users in every UI surface (profiles, members directory, orders, ticket views, admin pages, etc.).
/sports-guides is FROZEN — do not modify sports-guides routes, components, or `src/lib/parse-event-times.ts` unless user explicitly requests a sports-guides change.

## Memories
- [SECURITY DEFINER allowlist](mem://security/security-definer-allowlist) — Functions that must remain executable by `authenticated`; safe to ignore lint 0029 for them
- [Sports guides frozen](mem://constraints/sports-guides-frozen) — Do not touch sports-guides routes or parser without explicit request