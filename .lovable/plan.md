# Next BM Player login protections (suggested)

Already live: 3 boxes per login, Not me / Remove box, 60-day quiet logout, new-box alerts, sharing warnings, escalating lockouts, Android password lock and genuine-app check.

## Suggested next two
1. **Sign out every box** — one button on Link Device (and on the admin customer card) that removes every linked box for that account at once; each box returns to the link-code screen on its next check-in.
2. **Approve unknown boxes** — when an account number is typed on a box the website has never linked, the customer gets an Allow / Deny alert on the website and phone app; the box opens only after Allow (account-number entry on already-linked boxes is unchanged).

## Other options (not in this plan)
- Optional 4-digit box PIN or 8-digit account numbers
- Refuse logins from a second country instead of only flagging
- 30-day login re-check on every box
- Signed Windows/Mac installers

## Technical details
- Sign out all: owner-checked server function deleting the owner's player_devices rows plus pending credentials, logged to player_security_events.
- Approve unknown boxes: reuse the retired approval request tables behind a new flag, only for devices with no prior link; Android/Windows/Mac rebuild to show "Waiting for approval".
