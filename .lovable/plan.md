# Inactivity Screen Lock

Lock the app after a period of no activity, with a full-screen lock overlay showing a digital illustration of a person sat at a PC with a locked screen. Unlock with a personal lock code or a 2FA code, or request a reset that alerts Owner/Management.

## How it behaves

1. **Idle detection** — mouse, keyboard, touch, scroll and tab-focus reset a timer. When the timeout passes, a full-screen lock overlay covers the whole app (all signed-in pages). Content behind it is blurred so nothing sensitive stays readable.
2. **Defaults and settings** — lock is ON by default for everyone with a 15-minute timeout. Each user can change their timeout in Account Security (5 / 10 / 15 / 30 / 60 minutes, or Off). Staff roles (Owner, Management, Staff, Moderator) are capped at a 10-minute maximum and cannot switch it off — their selector only offers 1, 5 and 10 minutes.
3. **Unlock** — the lock screen asks for the user's **lock code** (a separate 4-6 digit code, set on first lock and changeable in Account Security). If the user has two-factor authentication enabled, a "Use authenticator code instead" option accepts their 6-digit 2FA code as an alternative. Five wrong attempts in a row signs the user out completely.
4. **Forgot code** — a "Request a reset" button on the lock screen logs a reset request. Owner and Management see a pop-up alert (the same real-time staff notification style already used for 2FA reset requests) with Approve. On approval:
   - A temporary lock code is generated and stored, flagged as must-change.
   - The user receives a branded HTML email confirming the reset, containing the temporary code and who reset it.
   - Next time they unlock with the temporary code, they are forced to set a new lock code before the app unlocks.
5. **Lock now** — a manual "Lock screen" item is added to the avatar menu.

## Lock screen design

Centered card over a blurred app backdrop:
- A generated digital illustration: a person seated at a desk in front of a monitor showing a padlock, dark navy/teal palette matching the app theme.
- User's avatar and display name, "Screen locked due to inactivity".
- Code entry field (numeric, masked), Unlock button, "Use authenticator code" toggle when 2FA is on, "Request a reset" link, and Sign out.

## Technical notes

- **Database migration** (one migration, with GRANTs + RLS):
  - `screen_lock_settings` — `user_id` (PK, references auth user id), `enabled`, `timeout_minutes`, `code_hash`, `must_change`, timestamps. Users manage only their own row.
  - `screen_lock_reset_requests` — `user_id`, `status` (pending/approved/denied), `requested_at`, `handled_by`, `handled_at`. Users insert their own; Owner/Management read and update all via `has_role`.
  - Realtime enabled on the reset-request table for the admin pop-up.
- Code hashing follows the existing vault-PIN scheme (`SHA-256` of `${user_id}:${code}`), verified client-side for unlock and server-side for admin reset.
- `src/lib/screen-lock.functions.ts` — server fns: `requestLockReset`, `listLockResetRequests`, `approveLockReset` (Owner/Management only, generates temp code, enqueues email via the existing `enqueue_email` flow), `setLockCode`.
- `src/lib/email-templates/screen-lock-reset.tsx` — new HTML template registered in `email-templates/registry.ts`.
- `src/components/app/ScreenLockProvider.tsx` — idle timer, activity listeners, cross-tab sync via `localStorage`/`BroadcastChannel`, renders `ScreenLockOverlay`. Mounted in `src/routes/_authenticated/_approved.tsx` so it covers every signed-in page.
- `src/components/app/ScreenLockOverlay.tsx` — lock UI, unlock via code hash or `supabase.auth.mfa.challengeAndVerify`, forced code change flow.
- `src/components/app/ScreenLockResetAlerts.tsx` — realtime pop-up for Owner/Management, added alongside the existing admin alert components.
- Account Security page gains a "Screen lock" card: enable toggle (locked on for staff), timeout selector with the staff cap, and set/change lock code.
- Lock state persists across reloads (stored locked flag), so a refresh does not bypass the lock.
- Illustration generated as an asset under `src/assets/` and imported directly.
