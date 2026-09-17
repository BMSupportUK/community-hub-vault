# Fan Zone friends: counts that open full-page friend cards

## What changes

On the Boro Fan Zone Friends tab, show two counters at the top:

- **Friends** — everyone you are connected with (whether you added them or they added you).
- **Mutual friends** — fans where each of you has separately added the other, so the friendship is confirmed both ways.

Clicking either number opens a full-screen dialogue listing those fans as cards. Each card shows their picture, their fan name, and a small label saying whether the friendship is one-way or mutual. Clicking a card takes you to that fan's profile; a Remove button stays available on the card.

Friend requests waiting for a reply stay where they are today, above the counters.

## Layout

```text
Friends
[ 12 Friends ]   [ 5 Mutual friends ]      <- clickable counters

(clicking a counter)
+------------------------------------------+
|  Friends (12)                        [X] |
|  [pic] Alias        Mutual   [Remove]    |
|  [pic] Alias        One-way  [Remove]    |
|  ... cards in 2-3 columns, scrollable    |
+------------------------------------------+
```

## Fix included

The current accepted-friends list only shows people you sent the request to; friendships you accepted from someone else are missing. Both counters and both lists will include friendships in either direction.

## Technical notes

- Work stays in `src/routes/_authenticated/_approved/fanzone.profile.tsx` (`FriendsPanel`), reusing the existing `fan_zone_friendships` read plus the `fan_zone_aliases` RPC for names/pictures. No schema or policy changes.
- Accepted friends = rows with `status = 'accepted'` where the user is requester or addressee (fixes the current requester-only filter).
- Mutual = an accepted row exists in both directions for the same pair (`requester_id`/`addressee_id` swapped); the table's unique constraint is on the ordered pair, so reverse rows are what distinguishes mutual from one-way.
- Full-page view uses the existing shadcn `Dialog` with a near-full-viewport content class and a responsive card grid (1/2/3 columns) with wrapped text, matching the Fan Zone red/black styling used elsewhere.
- Existing realtime subscription on `fan_zone_friendships` keeps counts and the open dialogue in sync; remove/accept actions are unchanged.
