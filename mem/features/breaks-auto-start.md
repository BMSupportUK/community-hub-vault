---
name: Auto-start breaks for Dane J and NormanbyRed77
description: Breaks for danej and normanbyred77 start automatically at the allocated time with a pop-up warning; must fire even while the screen is locked
type: feature
---

Breaks for Dane J and NormanbyRed77 (usernames `danej`, `normanbyred77`) start automatically at their allocated rota times — never manually. Any open tickets are passed over first, then a "Break started" pop-up warns them; the break ends on its own.

The auto-start must fire at the break time even while the screen lock is showing — not on unlock. The Working Status box unmounts behind the lock, so the lock-safe starter lives in the notification-only slot (AutoBreakStartListener), keeping the pop-up above the lock screen.

Everyone else starts breaks only from the allocated-time pop-up (pass tickets over first); no manual break starts for anyone.
