# Paid proxy detection key for the VPN check

Wire a paid proxycheck.io API key into every IP reputation lookup in the app, so real residential and business proxies flag properly instead of relying on unauthenticated free-tier limits.

## Cost

proxycheck.io pricing (their published tiers):

- Free with a key: 1,000 queries/day (100/day with no key at all — what we use today).
- Paid: about $3.99/month for 10,000 queries/day.
- Higher tiers: about $29.99/month for 100,000/day, with larger plans above that.

For this app's traffic the ~$4/month tier is comfortably enough: one lookup per login, per signup, plus occasional admin backfills. Residential/business proxy and compromised-server flags come from the same key — no separate add-on.

## Detection rule

Any positive flag counts as a VPN/proxy. That means proxycheck's `proxy: yes` for any type (VPN, residential proxy, business proxy, TOR, compromised server, hosting), plus the existing free fallbacks. No score threshold, so it is deliberately sensitive.

## What changes

1. Store the key as a backend secret (`PROXYCHECK_API_KEY`), requested through the secure secret form — never in code.
2. Add one shared server-side helper that all four current call sites use, so the key, timeouts, and flag parsing live in a single place:
   - live visitor check
   - login check
   - signup info capture
   - admin bulk backfill
3. When the key is present, request the full flag set (`vpn=1&asn=1&risk=1&node=1`) and read every positive signal: proxy yes, VPN type, residential/business proxy type, TOR, hosting/compromised server, and risk data. When the key is absent, behave exactly as now (keyless free tier) so nothing breaks if the key is ever removed.
4. Keep the existing "unavailable never means clean" behaviour: a failed or rate-limited lookup still returns `checked: false` rather than "no VPN".
5. Batch backfill uses the key too, raising the per-request IP limit and removing the tight free-tier throttling.
6. Verify against the live app in the browser with a VPN active, and confirm the paid key is actually being used (the API reports plan status in its response) rather than silently falling back.

## Next step

Once approved, I request the proxycheck key via the secure secret form, then make the changes. You will need to create the key at proxycheck.io (Dashboard, API Keys) and subscribe to a paid tier there for residential/business proxy coverage; a free-tier key still works but with the 1,000/day cap.
