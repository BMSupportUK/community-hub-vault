## Goal
Add professional, optional **TOTP 2FA** (Google Authenticator/Authy/1Password etc.) to the platform, using Supabase Auth's native MFA. Add a recommendation banner, let users enable/remove it themselves, let admins/management reset another user's 2FA from the Members admin area, and give locked-out users a self-serve way to request a reset via the existing ticket system.

---

## 1. Enable Supabase MFA (TOTP)

Supabase Auth has native TOTP MFA — no new tables/edge functions for the core flow. We just turn it on and build the UI.

- Configure auth so TOTP factors are allowed (`configure_auth` / project settings).
- AAL (Authenticator Assurance Level) is enforced client-side: after `signInWithPassword`, check `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`. If `nextLevel === 'aal2'` and `currentLevel === 'aal1'` → redirect to a `/mfa-challenge` page before allowing app access.

## 2. New routes / UI

**`/mfa-challenge`** (public, post-login)
- Shown when user has a verified TOTP factor but session is only aal1.
- 6-digit code input → `supabase.auth.mfa.challengeAndVerify({ factorId, code })`.
- "Lost your device? Contact support" link → opens a new ticket prefilled in the "Account / 2FA reset" category (see §5).

**Profile → Security tab** (new section in `profile.tsx`)
- If no factor: "Enable two-factor authentication" button → `mfa.enroll({ factorType: 'totp' })` → show QR code (`data.totp.qr_code`) + secret + 6-digit verify input → `mfa.challengeAndVerify` to activate.
- If active: show "2FA is on" with a **Remove 2FA** button (requires current TOTP code, then `mfa.unenroll({ factorId })`).
- Show recovery guidance ("save your backup codes in your password manager — if you lose access, raise a ticket").

**Recommendation banner**
- Small dismissible bar at the top of `_approved.tsx` layout: *"We recommend turning on two-factor authentication to protect your account. [Enable now]"* — links to Profile → Security.
- Hidden when user already has an active TOTP factor, or when dismissed (stored in `localStorage`).

## 3. Admin reset (Members page)

In `members.tsx`, for admins/management only, add a **"Reset 2FA"** action per member.

- New server function `resetUserMfa({ userId })`:
  - Middleware: `requireSupabaseAuth` + check caller has `admin` or `management` role.
  - Uses `supabaseAdmin.auth.admin.mfa.deleteFactor` (or lists factors via `auth.admin.listFactors(userId)` and deletes each) to wipe TOTP factors for that user.
  - Writes an audit row into a new `mfa_reset_log` table (`target_user_id`, `reset_by`, `reason`, `created_at`) with RLS so only admins/management can read.
- UI: confirm dialog ("This will remove their 2FA. They'll be able to sign in with just their password and should re-enable it."), optional reason field, toast on success.

## 4. Customer-facing self-remove

Already covered by the "Remove 2FA" button in Profile → Security (§2). Requires the user to enter a valid current TOTP code, so a thief with just the password can't disable it.

## 5. Self-serve reset via tickets

Add a dedicated ticket category for lockouts so users without device access can request a reset.

- Insert a `ticket_categories` row: `"Account & 2FA reset"` (sort_order pinned near top).
- The `/mfa-challenge` page's "Lost your device?" link sends users to `/tickets?new=1&category=account-2fa-reset` with the category preselected and a template body ("I've lost access to my authenticator app and need 2FA reset on my account.").
- Staff handle it in the existing tickets UI; once identity is verified, they hit "Reset 2FA" on the Members page (§3) and reply to close the ticket.
- The `notify_ticket_raised` trigger already pings staff — no change needed.

## 6. Database changes

Single migration:

```sql
-- Audit log for admin 2FA resets
create table public.mfa_reset_log (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null,
  reset_by uuid not null,
  reason text,
  created_at timestamptz not null default now()
);
alter table public.mfa_reset_log enable row level security;
create policy "admins read" on public.mfa_reset_log for select
  using (public.has_any_role(auth.uid(), array['admin','management']::app_role[]));
create policy "admins insert" on public.mfa_reset_log for insert
  with check (public.has_any_role(auth.uid(), array['admin','management']::app_role[]));

-- Seed the new ticket category (insert via data tool, not migration)
```

Plus a `supabase--insert` to add the "Account & 2FA reset" ticket category.

## 7. Files touched

- **New:** `src/routes/mfa-challenge.tsx`, `src/components/app/Mfa2FABanner.tsx`, `src/components/app/SecuritySection.tsx` (profile tab), `src/lib/mfa.functions.ts` (admin reset + audit insert).
- **Edited:** `src/routes/login.tsx` (post-login AAL check + redirect), `src/routes/_authenticated/_approved.tsx` (mount banner), `src/routes/_authenticated/_approved/profile.tsx` (Security tab), `src/routes/_authenticated/_approved/members.tsx` (Reset 2FA action for admins), `src/routes/_authenticated/_approved/tickets.tsx` (read `?new=1&category=` query params to prefill).

## Out of scope
- SMS/email OTP as a factor (TOTP only — far more secure, no Twilio cost).
- Backup recovery codes (Supabase doesn't generate them natively; users are guided to keep their TOTP secret safe, and tickets handle lockouts).
- Forcing 2FA on staff (recommend only — can add later if you want a hard requirement for `admin`/`management`/`staff` roles).
