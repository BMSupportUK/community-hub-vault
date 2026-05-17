## Problem

When a rejected user submits an appeal, neither side can actually chat:

1. `submit_appeal` (DB function) flips their `gate_applications` row back to `pending` and adds a `pending` role, **but it never removes the `rejected` role**.
2. `_authenticated.tsx` checks `isRejected` **before** `isPending`, so the user is force-redirected back to `/account-rejected` — a static page with no chat UI. The "Open an appeal" button just re-submits the same RPC.
3. On the admin side, the appeal *does* show up in the Moderation "Pending" queue (because status is `pending`), but it's visually indistinguishable from a normal first-time access request, and it's easy to miss that this is an appeal.

The chat plumbing in `/moderation` and `/gate` already works for pending tickets — the appeal flow just never reaches it.

## Fix

### 1. Unblock the user side (DB)

New migration updating `public.submit_appeal`:

- After flipping the application back to `pending`, also `DELETE FROM user_roles WHERE user_id = v_uid AND role = 'rejected'` (mirrors how it already deletes `banned`).
- Keep the `pending` role insert.

Result: once the user submits an appeal, their effective role becomes `pending`, the `_authenticated` guard routes them to `/gate`, and the existing two-way chat (already wired in `gate.tsx`) lights up.

When an admin later denies again, `decide()` in `moderation.tsx` already deletes `pending` and inserts `rejected` — no change needed.

### 2. Make appeals obvious in Moderation (UI only)

In `src/routes/_authenticated/_approved/moderation.tsx`:

- Detect appeals by `reason?.startsWith("[APPEAL]")`.
- Add an "Appeal" badge (amber/fuchsia) next to the row name in the pending list, and a small "This is an appeal of a previous rejection" banner inside the expanded panel so reviewers see the prior context at a glance.
- Strip the `[APPEAL]` prefix when displaying the reason text (the badge already conveys it).
- No changes to chat / approve / deny logic — they already work when status is `pending`.

### 3. Clean up the dead-end page

In `src/routes/_authenticated/account-rejected.tsx`:

- After `submit_appeal` succeeds, the user's role is now `pending` (via #1), so `refreshRoles()` + `navigate({ to: "/gate", search: { chat: 1 } })` will actually land them on the gate chat. No code change needed beyond verifying the existing navigate call still runs — which it does.

## Technical notes

- Migration is a `CREATE OR REPLACE FUNCTION` on `public.submit_appeal(text)` — preserves signature, grants, and the `[APPEAL] ...` reason format consumed by the moderation UI.
- No schema changes, no new tables, no RLS changes (existing `gate_messages` / `gate_applications` policies already allow mod ↔ applicant chat on pending tickets).
- No changes to `/gate` — the appellant simply reaches it now.

## Files touched

- `supabase/migrations/<new>.sql` — replace `submit_appeal` to also drop the `rejected` role.
- `src/routes/_authenticated/_approved/moderation.tsx` — appeal badge + banner in expanded panel; strip `[APPEAL]` prefix when rendering reason.
