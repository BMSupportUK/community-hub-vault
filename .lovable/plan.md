# Block sign-ups while a VPN is connected

Right now the sign-up page already greys out the join button when it spots a VPN, but the check is done in the browser only. If the check can't complete (lookup fails, rate limit, someone tampers with the page), sign-up goes through anyway and the VPN is only noted after the account exists.

This change makes the VPN check a real gate on every sign-up, for both BM Support and Boro Fan Zone.

## What the visitor sees

1. On opening the sign-up page, a short "Checking your connection…" note while the check runs.
2. VPN or proxy detected: a clear red panel above the join button — "Please disable your VPN or proxy to create an account, then press Re-check." The join button stays disabled. A Re-check button re-runs the check straight away, so they don't have to reload.
3. Check can't complete: same block, worded as "We couldn't verify your connection. Please disable any VPN or proxy and press Re-check." Unverified is treated as blocked, not clean.
4. No VPN: normal join button, no extra wording.
5. If they somehow submit while flagged, the existing pop-up explaining to disable the VPN still appears.

## Server-side gate

- A fresh server-side check runs at the moment of submit, using the visitor's real connection, before the account is created. If it comes back flagged, no account is created and the block panel appears.
- The check uses the paid proxy-detection key already configured, so residential and business proxies flag too.
- Positive flag or failed lookup both count as "not allowed" — a failed lookup never means clean.

## Technical notes

- New public server function `assertSignupAllowed` (`src/lib/vpn-public-check.functions.ts` or a sibling `signup-gate.functions.ts`), no auth middleware, reads the request IP via `getRequestIP`/`cf-connecting-ip` and calls the shared `fetchProxycheckEntry` + `proxycheckVerdict` in `src/lib/proxycheck.server.ts`. Returns `{ allowed, reason }`; localhost/private IPs are allowed so preview testing works.
- `src/routes/signup.tsx`: use `useVisitorVpnStatus()` instead of the boolean `useVisitorVpn()` so `checking` and `unavailable` are handled distinctly; disable the join button unless status is `unprotected`; add the inline block panel and a Re-check control calling the hook's forced refresh.
- In `submit`, call `assertSignupAllowed` before `supabase.auth.signUp` and bail out with the block panel when not allowed.
- Existing `recordSignupInfo` capture and blacklist auto-ban behaviour stay untouched.
- Login flow, packages page and other VPN surfaces are unchanged.
