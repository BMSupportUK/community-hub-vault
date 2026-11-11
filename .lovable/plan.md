# Stop Multi Room and Triple Room logins being shared

Today a Multi/Triple Room login gets a warning and an admin report when a box watches away from home, but nothing actually stops it. This plan adds layers that make sharing hard, plus a clear strike system so genuine customers aren't punished by one odd reading.

## 1. Box allowance per package
- Each login can only have a set number of linked boxes: Multi Room 2 boxes + 1 phone, Triple Room 3 boxes + 1 phone (Single keeps its current rule).
- Any extra box waits for admin approval in Security, like the current 4th-box approval.
- Only one mobile connection per account, ever. A second phone cannot be linked or play.

## 2. Home check all the time, not just when a channel starts
- Every check-in from a box (about once a minute) is compared with the home internet, so moving a box mid-viewing is caught too.
- Only ONE device per account may watch away from home at a time (the phone on mobile data, or a box taken on holiday).
- Holiday rule: while that away device is watching, nothing on the home internet can play. Home boxes show "Your login is being watched away from home" with "Watch here instead", which stops the away device. The account is never used in two places at once.
- A second away device trying to play is refused straight away.

## 3. Strongest sharing signal: two houses at once
- If two non-mobile boxes on the same login are watching **at the same time from different internet connections**, that's a strike straight away. One house can't be in two places.

## 4. Strikes and blocking
- Strike 1: warning on the box + admin report (what happens today).
- 3 strikes in 7 days: that box can only play from the home internet (or the phone on mobile data). Away from home it shows "This login can only be used at home. Contact BM Support."
- Admin can clear strikes, unblock, or "Make this home" from the report. The customer sees their status on the website Link Device page.

## 5. Moving house / new broadband
- Home internet addresses can change. If **all** of a login's boxes move to the same new connection together, home updates on its own with no strike, because that's a broadband change, not sharing.
- A customer can tap "I've moved / new broadband" on Link Device; an admin approves it.

## 6. VPNs
- Linking already needs the VPN off (staff exempt).
- While watching, a Multi/Triple Room box on a VPN gets reported (as now) and counts as a strike when another box is watching from home at the same time.

## 7. Admin view
- The customer card and Security show a sharing history per login: home connection, devices, strikes, and current block state.

## What customers need
- New Android/Amazon, Windows and Mac versions to show the "home only" block message. Older versions are still blocked by the website (the box gets no stream permission), but show the general "already watching" message.

## Technical details
- New `player_login_strikes` table (service-role only) and `blocked_away_until` on `player_login_homes`.
- Poll handler runs `householdVerdict` per check-in; a "simultaneous different IP" rule is added to `src/lib/player-household.ts` with tests (2 houses at once = strike, 3 strikes/7 days = block, all boxes moving together = home update, phone on mobile allowed).
- `stream_claim` returns `blocked: "away"` when blocked away from home; apps show the message and don't play.
- Box allowance moves into `player-security.ts` using the package connections (staff stay exempt).
- New admin server functions: clear strikes, approve a move; Link Device shows the status and the move request.
- Release Android/Amazon, Windows and Mac after the website is published.
