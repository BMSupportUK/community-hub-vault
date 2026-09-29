# Remote sign-out in Owner tools

## What you'll get
A new **"Sign out devices"** card in Owner tools (next to Theme and Header links) that opens its own section:
- Search any member by name (emails shown only to admin/management, as now).
- See when they last signed in and how many devices are signed in.
- **Sign out everywhere** button with a confirm step ("Sign out DaneJ from all devices?").
- The person is kicked out straight away on any open phone, browser or Windows app and has to sign in again. Their password is not changed.
- Works on your own account too (e.g. a lost phone) — with an option to keep this current device signed in.
- Only admin and management can use it; nobody can sign out the owner account except the owner.

## Technical details
- New tab `sign-out-devices` in `admin.tsx` with a `RemoteSignOutCard` component.
- Server function (`requireSupabaseAuth`), checks the caller's role via `has_role`, then uses the admin client to revoke all the target's sessions (refresh tokens), optionally excluding the caller's current session for self sign-out.
- Instant kick: broadcast a `force-signout` event on the target user's personal realtime topic; the app listens once in the root and calls sign-out (reusing the existing clean Talk presence leave on sign-out). Tokens already issued also stop refreshing, so any device that misses the broadcast drops within the hour at most.
- Each use is logged to an audit table (who, target, when) and shown as "Last remote sign-out" on the card.
