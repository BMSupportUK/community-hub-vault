# Context-aware account menu

Make the avatar/account dropdown match the split already used by the icon side rail: BM Support items when you're in the support side of the app, Fan Zone items when you're inside the Boro Fan Zone.

## Behaviour

Detect the current route with the same Fan Zone path list the icon rail uses (`/forum`, `/fanzone`, `/fan-zone`, `/boro-fantasy`, `/boro-predictions`, `/predictions`, `/competition-winners`).

BM Support context (default):
- Edit profile
- View profile
- Copy username
- Security & 2FA
- Get the Android app
- Owner dashboard (owner/admin only, unchanged)

Fan Zone context:
- Fan Zone profile & settings
- View profile (Fan Zone public profile)
- Copy username
- Security & 2FA

Always shown at the bottom in both contexts, unchanged: Lock screen and Sign out.

The section label changes with context ("ACCOUNT" vs "FAN ZONE ACCOUNT") so it's obvious which part of the site the menu applies to.

## Technical notes

- Single file change: `src/components/app/UserAvatarMenu.tsx`.
- Extract the Fan Zone prefix check into a small shared helper so `IconRail.tsx` and the avatar menu stay in sync rather than duplicating the array.
- Items are driven by a `show` flag per entry, same pattern as the rail, so no duplicated JSX blocks.
