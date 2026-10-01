# Add "Accurate to ~X km" to sign-up location displays

## Goal
Show staff how much to trust each IP location estimate, without paying for a new provider.

## How it works
The existing free location data doesn't come with a true accuracy figure, so the estimate is derived from how specific the result is:
- City known → "Accurate to ~25 km"
- Region/county only → "Accurate to ~100 km"
- Country only → "Accurate to ~1,000 km"

## What changes for staff
- Security gate, moderation review and member location views show an "Accurate to ~X km" line under the city/region/country for each sign-up and login.
- Nothing else changes: VPN detection, the data stored, and sign-up flow all stay exactly as they are.

## Technical details
- Small shared helper (e.g. `locationAccuracyKm(loc)`) that returns the radius from which of city/region/country is present.
- Render the label in the existing admin/staff location display components; no database migration needed since it's computed from fields already stored.
