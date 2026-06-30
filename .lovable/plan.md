## Goal
Signup with a valid invite code skips `/gate` and the user is auto-approved with the `nonsubscriber` role (BM Support intent).

## Changes

### 1. Migration — update `redeem_invite`
On a successful redemption, grant the redeeming user the `nonsubscriber` role:

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES (v_uid, 'nonsubscriber')
ON CONFLICT (user_id, role) DO NOTHING;
```

Return `jsonb_build_object('ok', true, 'pending_approval', false, 'granted_role', 'nonsubscriber')`. Keep all existing validation (auth required, invalid code, already used, self-invite).

### 2. `src/routes/signup.tsx`
After a successful `redeem_invite` for BM Support intent:
- toast "Welcome — invite accepted"
- navigate to `/home` instead of `/gate`

Other paths unchanged:
- Fan Zone intent: still goes through `/fan-zone-pending` (moderation kept).
- No invite code, or redemption error: unchanged (gate / pending flow).

### 3. Verify
- Sign up via `/signup?invite=VALIDCODE` (BM Support) → land on `/home`, `user_roles` row has `nonsubscriber`.
- Sign up without a code → unchanged gate flow.
- Reused/invalid code → unchanged error toast then gate.
