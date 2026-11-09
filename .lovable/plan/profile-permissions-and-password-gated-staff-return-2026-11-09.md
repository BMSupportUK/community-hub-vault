# Profile permissions and password-gated staff return

## Result
- Selecting a customer profile opens the Customer Portal with customer-only access: no staff tools, staff records, administration actions or staff-only pages.
- Returning to the staff profile requires the signed-in account's password. A wrong password leaves customer access unchanged.
- Keep the existing account, logins, six-digit numbers, subscriptions and ownership intact. Do not create fictitious customer sign-ins or change permanent staff roles.

## Implementation
1. Store the selected owned profile and its access scope securely for the verified website session. Customer restriction survives refresh, token renewal and other tabs using that session. Changing browser storage cannot restore staff permissions.
2. Enforce that restriction in database reads, writes and callable actions, including direct requests outside the website. Restrict staff role checks and privileged server actions consistently; do not rely on hidden buttons.
3. Make navigation, headers, account menus and page access use the same restricted permissions. Clear protected cached content when switching, and keep the chooser available so the owner can return.
4. Add the password prompt for staff return using the existing identity-bound password verification pattern. Restore access only after successful verification and confirm the account still has a staff role. Preserve existing two-factor requirements and rate-limit failed password attempts.

## Technical safeguards
- Use a session-bound, server-controlled profile scope rather than rewriting the owner's permanent roles or trusting a profile ID in browser storage.
- Audit database role helpers, direct role-table reads, security-definer functions and server actions that use privileged clients. Apply the customer restriction to each authorization path before activating switching.
- Profile scope applies to the current website session; separately signed-in staff sessions remain independent.
- Do not edit the locked Talk/ticket channel or video-call code. Enforce restrictions at shared authorization boundaries; any unavoidable locked-code change must be raised before proceeding.

## Verification
- Customer selection hides staff controls and denies staff pages, direct database reads/writes and privileged server actions using the same bearer token.
- Refresh and another tab retain customer permissions; modifying the locally saved profile cannot bypass the restriction.
- Wrong staff password is rejected; correct password restores the verified staff role and portal.
- Revoked staff roles cannot be restored by password verification.
- Existing player account numbers and subscription details remain unchanged.

## Current status
The portal-only change is already implemented, but it does not yet restrict staff permissions. This work replaces that presentation-only behavior with enforced access separation. No permanent role or customer data changes have been made for this permission request.