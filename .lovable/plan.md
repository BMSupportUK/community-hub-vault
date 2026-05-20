
## Goal

Keep a chronological trail of every user's location (one row per login), and show it in the admin dashboard.

## What gets recorded per event

- `user_id`
- `ip`
- `country`, `region`, `city`
- `latitude`, `longitude` (from IP geo — city-level; ~5–50km accuracy)
- `isp`, `is_vpn`, `is_proxy`, `vpn_provider`
- `user_agent`
- `event_type` (`signup` | `login`)
- `created_at`

> Note on accuracy: this uses IP geolocation only (no browser GPS prompt). It's accurate to city level and will look "off" on mobile networks or VPNs — but it's silent, requires no consent, and works on every login. If you later want street-level pins, we can add an optional `navigator.geolocation` prompt as a phase 2.

## Backend changes

### 1. New table `public.user_location_history`
- Columns: `id`, `user_id`, `event_type`, `ip`, `country`, `region`, `city`, `latitude`, `longitude`, `isp`, `is_vpn`, `is_proxy`, `vpn_provider`, `user_agent`, `created_at`
- Indexes on `(user_id, created_at desc)` and `(created_at desc)`
- RLS:
  - User can `SELECT` their own rows
  - Admin / management / moderator can `SELECT` all rows
  - Inserts only via SECURITY DEFINER RPC (no direct insert policy)

### 2. New RPC `insert_my_location_event(_event_type, _ip, _country, ...)`
- SECURITY DEFINER, validates `auth.uid()`, writes one row.

### 3. Hook into existing flows
- **`src/lib/signup-info.functions.ts`** (`recordSignupInfo`) — after the existing `signup_info` insert, also insert a `user_location_history` row with `event_type = 'signup'`. Reuse the proxycheck result already fetched.
- **`src/lib/vpn-login-check.functions.ts`** (`checkMyVpnOnLogin`) — after the `upsert_my_signup_vpn` call, also insert a `user_location_history` row with `event_type = 'login'`. Reuse the same vpn lookup result. Already runs on every login via `use-auth.tsx`, so no client wiring needed.

## Admin UI

### `src/routes/_authenticated/_approved/admin-roles.tsx`
Add a "Location history" button on each user row that opens a dialog showing the most recent 50 events as a table:

```
When                 IP              Location                  VPN   Provider/ISP
2026-05-20 14:33     82.x.x.x        London, England, GB       —     Sky Broadband
2026-05-20 09:12     185.x.x.x       Frankfurt, HE, DE         VPN   NordVPN
2026-05-19 22:01     82.x.x.x        London, England, GB       —     Sky Broadband
```

- Loaded on demand (not eagerly with the user list) via a small server fn `getUserLocationHistory({ userId, limit })` using `requireSupabaseAuth` + admin-role check.
- Optional "Export CSV" button.

## Out of scope (ask if you want any of these)

- Browser GPS prompt for exact coordinates
- Continuous `watchPosition` tracking while the app is open
- Map visualisation (pins / heatmap) — currently just a table
- Alerting on country/IP changes between logins

## File touch list

- `supabase/migrations/<new>.sql` — table + RLS + RPC
- `src/lib/signup-info.functions.ts` — append history insert
- `src/lib/vpn-login-check.functions.ts` — append history insert
- `src/lib/user-location-history.functions.ts` — new, admin read fn
- `src/routes/_authenticated/_approved/admin-roles.tsx` — dialog + button
