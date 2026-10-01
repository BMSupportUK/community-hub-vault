# Paid city-level location for sign-ups and logins

## Goal
Get better city/area estimates for each sign-up and login IP so staff can spot mismatches between where someone says they are, their phone GPS trail, and their connection.

## Provider
MaxMind GeoIP2 City Plus (web service). It is the industry standard for city accuracy, gives an accuracy radius in km, and costs roughly a fraction of a penny per lookup (pay-as-you-go credit). You'll need a MaxMind account and to give me its Account ID and License Key when asked.

## What changes for staff
- Security gate, moderation review and member location views show:
  - City, region, postcode area (when known)
  - "Accurate to ~X km" so staff know how far to trust it
  - A "Location mismatch" badge when the IP city is far from the member's GPS location (over 50 km)
- Existing VPN detection (the four free checks) stays exactly as is.
- If MaxMind is unreachable or out of credit, it falls back to the current location source — sign-up never breaks.

## Technical details
- New server-only helper `src/lib/maxmind.server.ts` calling `https://geoip.maxmind.com/geoip/v2.1/city/{ip}` with Basic auth from secrets `MAXMIND_ACCOUNT_ID` / `MAXMIND_LICENSE_KEY` (requested via add_secret).
- Use it in `signup-info.functions.ts`, `vpn-login-check.functions.ts` and `vpn-backfill.functions.ts` to override city/region/country with MaxMind values; keep proxycheck values as fallback.
- Migration: add `postal_code`, `accuracy_radius_km`, `geo_source` columns to the signup/login location tables and extend the existing RPCs (`_city` etc.) to accept them.
- Mismatch: compute distance (haversine) between IP lat/lon and latest GPS point; show badge in admin views. Emails remain admin/management only.
- Lookups only happen on sign-up and login (not per page view) to keep cost low.
