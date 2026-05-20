## Add 2FA option to reveal credentials

Add a second unlock method on the Credentials & DNS gate so users with 2FA enabled can verify with their authenticator code instead of typing their account password + vault PIN every time.

### Where

`src/routes/_authenticated/_approved/u.$username.tsx` — the `RevealGate` component (around lines 1225–1357). No backend / schema changes.

### Behaviour

On mount, `RevealGate` checks `supabase.auth.mfa.listFactors()`. If the user has at least one **verified TOTP factor** AND has already set a vault PIN (existing precondition), show a small two-option toggle at the top of the unlock card:

- **Password + PIN** (existing flow, unchanged — stays the default)
- **2FA code** (new)

If the user has no verified TOTP factor, nothing changes — they see today's password + PIN form exactly as now.

The "Forgot PIN? Reset it" link still requires account password (it's a credential reset, not a reveal — should stay password-gated).

### 2FA unlock flow

When the user picks the 2FA tab:

1. Show a single 6-digit input ("Authenticator code") + "Reveal credentials" button.
2. On submit:
   - `supabase.auth.mfa.challenge({ factorId })` using the first verified TOTP factor.
   - `supabase.auth.mfa.verify({ factorId, challengeId, code })`.
   - On success → call `onUnlocked()` (same as password+PIN path).
   - On failure → toast "Incorrect code".
3. Same 5-minute auto-lock timeout already applied to the unlocked state — no change needed there.

### Why this is safe

- Verifying a TOTP factor proves possession of the second factor that already gates account sign-in — equivalent or stronger than re-entering the account password.
- The vault PIN's purpose was "a second secret in case someone leaves the session unlocked"; a fresh TOTP code from the user's phone serves the same shoulder-surfing-resistance purpose.
- The reveal still requires an *active* action (TOTP code) each time — it's not a "remember me".
- Reveal still auto-locks after 5 minutes.

### UI details

- Toggle uses the same pill style as the existing `creds / dns` tab switcher above.
- 2FA tab shows a `Smartphone` icon (add to existing lucide-react import).
- Default tab = whichever method the user used last (persist in `localStorage` under `reveal-method:<userId>`), falling back to "password+PIN".
- If 2FA tab is selected but the factor lookup later returns nothing, silently fall back to password+PIN tab.

### Implementation notes

- Add a `useEffect` in `RevealGate` to load factors: `supabase.auth.mfa.listFactors()` → keep `factorId` state of first `status === "verified"` TOTP factor (or null).
- Add `method` state: `"pin" | "totp"`.
- Reuse existing `busy` / `onUnlocked` plumbing.
- No changes to `vault_pins` table, no changes to credentials policies, no new server fn.

### Out of scope

- Adding 2FA enrollment UI (already exists at `/account-security` per earlier work).
- Letting users skip the vault PIN setup entirely when 2FA is enabled — PIN setup remains the one-time bootstrap. Can be a follow-up if you want.
