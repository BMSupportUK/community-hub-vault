---
name: Page permission enforcement
description: How admin role-permission pages gate access (page_permissions table, _approved layout guard, side rail)
type: feature
---
- `public.page_permissions.allowed_roles` is the single source of truth for BM Support page access.
- Semantics: page registered with roles ticked = only those roles (plus admin/management always); registered with **nothing ticked = owner/management only**; not registered at all = open.
- Enforced in two places: `src/routes/_authenticated/_approved.tsx` (redirects blocked pages to `/home`) and `src/components/app/IconRail.tsx` (hides rail icons). Shared logic in `src/lib/page-access.ts`.
- `/home` is never blocked (it is the redirect fallback). Fan Zone paths are excluded — they use Fan Zone membership gating instead.
