# Hide the bmsupport.uk name in APK download links

## Goal
Download links shown in Install Guides → "Download the BM Support app" should not show `bmsupport.uk`. Dane accepted a random made-up name isn't possible — the address has to really exist — so the workable option is a second, plain domain used only for download links.

## How it works
1. **Register/connect one neutral domain** (e.g. a plain name with no "bmsupport" in it — Dane picks the name). Cheapest route: buy it in Project Settings → Domains (paid plans), or connect one he already owns. One domain is enough — we don't need a new one per link, because the random 7-digit code already makes every link unique.
2. **Domain setup**: add the domain in Project Settings → Domains with the A/TXT records Lovable provides, wait for it to go Active. Then **unset bmsupport.uk as Primary** (Project Settings → Domains → ⋯ → Unset as primary) so the new domain serves the app at its own address instead of redirecting to bmsupport.uk. Note: with no Primary set, the whole site is also reachable on the new domain — only the download links will ever show it to members.
3. **Code change (small)**: in `src/lib/app-transfer.functions.ts` and `src/components/app/AppTransferPanel.tsx`, build the displayed link/QR from the new domain (e.g. `https://<plain-domain>/4839201`) instead of `bmsupport.uk`. The existing `/4839201` → `/api/public/a/<code>` redirect works on any connected domain with no other changes. Old bmsupport.uk links keep working until they expire.

## What this does NOT do
- The link can't be a completely random invented name each time — it must be a real registered domain.
- Anyone who visits the new domain can reach the site; the code check still protects the actual download.

## Steps
1. Dane picks/buys the plain domain (his action — needs his choice of name and a paid plan if buying through Lovable).
2. I verify the domain is Active and primary is unset.
3. I update the two files to use the new domain for transfer links and QR codes.
4. Verify in preview: request a transfer, confirm the link shows the new domain and downloads the APK.

## Technical details
- Files: `src/lib/app-transfer.functions.ts` (link builder), `src/components/app/AppTransferPanel.tsx` (display + QR).
- No database change; no change to `src/routes/$code.ts` or `src/routes/api/public/a/$token.ts` (domain-agnostic).
- Keep the domain name in one constant so it can be swapped later.
