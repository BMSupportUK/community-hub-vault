# Stop the password-screen flash on member checkouts

## Change
- Keep the secure checkout on a neutral loading screen while the unique link is being checked.
- Show the password form only after that check confirms the order is a password-protected manual order.
- If an old saved password fails, retry the link-only member checkout before showing the password form.

## Verification
- Hard-refresh order 8e908640 and confirm the manual password form never appears.
- Confirm a manual checkout still shows its password form when no valid password is stored.
