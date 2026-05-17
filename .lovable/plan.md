# Free Customer Verification System (revised)

A no-cost verification layer on top of existing signup data (IP, VPN, geo, device). No paid services. Final approval stays manual for admin/management.

## What gets checked

1. **Email — disposable block** — reject/flag throwaway domains using the `disposable-email-domains` npm list (offline, free).
2. **Email — MX record check** — DNS-over-HTTPS lookup to Cloudflare to confirm the domain can receive mail. No API key.
3. **Cloudflare Turnstile** — free, unlimited CAPTCHA on the signup form. Uses `@marsidev/react-turnstile` + server-side siteverify.
4. **Email code verification (NEW)** — 6-digit code sent to the customer's inbox as a branded HTML email. User enters the code to prove they own the inbox. Code expires in 15 minutes, max 5 attempts, regenerable.
5. **Duplicate IP / device** — server-side query against `signup_info` to count other users sharing the same IP or device fingerprint. Surfaced to admins as a signal, not auto-block.

(Removed: Google account linking.)

## Database

**`verification_checks`** (one row per user):
- `email_mx_ok` (bool), `email_disposable` (bool)
- `turnstile_ok` (bool)
- `email_code_verified` (bool), `email_code_verified_at` (timestamp)
- `duplicate_ip_count` (int), `duplicate_device_count` (int)
- `overall_status`: `pending` | `verified` | `flagged` (default `pending`)
- `verified_by` (uuid), `verified_at` (timestamp), `notes` (text)

**`email_verification_codes`** (short-lived):
- `user_id`, `code_hash` (sha256 of 6-digit code — never store plaintext)
- `expires_at`, `attempts` (int, max 5), `consumed_at`

**`email_templates`** (NEW — admin-editable):
- `key` (text, unique — e.g. `verification_code`)
- `subject` (text), `html_body` (text), `text_body` (text)
- `updated_by`, `updated_at`
- Seeded with a default `verification_code` template using `{{code}}`, `{{site_name}}`, `{{expires_in}}` placeholders.

Add `device_fingerprint text` to `signup_info`.

**RLS:**
- User reads own `verification_checks` / `email_verification_codes`.
- `email_templates`: admin/management read + write only.

## Server functions (`src/lib/verification.functions.ts`)

- `runEmailChecks({ email })` — disposable + MX checks.
- `verifyTurnstile({ token })` — POSTs to Cloudflare siteverify.
- `sendVerificationCode({ userId })` — generates 6-digit code, hashes it, stores it, renders the admin's `verification_code` template with placeholders substituted, enqueues via Lovable Emails (`send-transactional-email`).
- `confirmVerificationCode({ code })` — verifies hash + expiry + attempts; sets `email_code_verified = true`.
- `recomputeDuplicates({ userId })` — counts matching IPs/devices.
- `getVerificationForUser({ userId })` — admin-only.
- `setVerificationStatus({ userId, status, notes })` — admin/management only.
- `getEmailTemplate({ key })` / `updateEmailTemplate({ key, subject, html_body, text_body })` — admin/management only.

## Frontend

- **`src/routes/signup.tsx`** — add Turnstile widget; on submit run `verifyTurnstile` + `runEmailChecks`, create `verification_checks` row, then trigger `sendVerificationCode`.
- **`src/routes/_authenticated/gate.tsx`** — "Verification" card with status pills + a code input box ("Enter the 6-digit code we emailed you") + "Resend code" button.
- **`src/components/app/SignupInfoDialog.tsx`** — admin view: checks summary, duplicate-IP/device lists, `Approve` / `Flag` / `Reject` buttons.
- **`src/routes/_authenticated/_approved/admin-email-templates.tsx`** (NEW) — admin/management page in the Admin Dashboard:
  - List of templates (currently just `verification_code`, room to grow).
  - Editor with: subject input, HTML body (monospace textarea with syntax help), plain-text body, live preview pane that renders the HTML with sample values for `{{code}}`, `{{site_name}}`, `{{expires_in}}`.
  - "Send test email to me" button.
  - Save persists to `email_templates`.

## Email delivery

Uses Lovable Emails (already set up on this project) via `sendTransactionalEmail` with template name `verification-code`. The React Email template (`src/lib/email-templates/verification-code.tsx`) renders the HTML stored in `email_templates.html_body` after substituting `{{code}}`, `{{site_name}}`, `{{expires_in}}`. This way the admin's edits in the dashboard drive the actual email content while keeping Lovable Emails' queue/retry/suppression.

## Secrets needed

- `TURNSTILE_SECRET` (Cloudflare, free) — requested via `add_secret` before wiring code.
- `VITE_TURNSTILE_SITE_KEY` (public, in code).

## Out of scope

- Phone/SMS OTP (paid)
- ID document / selfie upload
- Auto-approve clean signups (you chose manual review)
- Social account linking (removed per your request)

---

Approve to proceed, or tell me what to change.
