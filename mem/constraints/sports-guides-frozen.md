---
name: sports-guides routes frozen
description: Do not modify /sports-guides routes, parser, or related files without explicit user request
type: constraint
---
Do NOT make any changes to /sports-guides pages, components, or the sports guide parser (`src/lib/parse-event-times.ts`, `src/routes/_authenticated/_approved/sports-guides*`) unless the user explicitly asks for a change to sports-guides specifically. Even if related refactors seem to require touching these files, stop and ask first.

**Why:** User has had repeated frustrating regressions in this area; it is now considered stable and locked.