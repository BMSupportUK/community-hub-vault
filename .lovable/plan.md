# Stop people from blocking the adverts

Detect ad blockers on the pages that show the rotating sponsor banners, and hide those pages behind a notice until the blocker is switched off.

## Where it applies

The two forum pages that show the sponsor banner:

- the board page (list of topics)
- the topic page (a thread)

Everything else in BM Support and the Boro Fan Zone is untouched.

## How the detection works

Three quick checks run together on page open, and the page is only treated as blocked when at least one clearly fails:

1. A small decoy element using names ad blockers commonly hide (`ad-banner`, `sponsor-slot`) is added off-screen; if the browser has removed it or forced it to zero size, a blocker is active.
2. A tiny request to a bait path that filter lists commonly block; a network-level refusal counts as blocked.
3. The real sponsor image itself: if it fails to load while the rest of the page loaded fine, that counts as blocked.

A slow or offline connection alone does not count as blocked — the checks only fire once the page is otherwise loaded, and an inconclusive result lets the page through.

## What the user sees

- While checking: the page renders as normal (the check takes well under a second, so there is no flash of a loading panel).
- When a blocker is found: the page content is replaced by a full panel reading that adverts keep BM Support free and asking them to turn off their ad blocker (or whitelist bmsupport.uk) for this site, with a **Re-check** button. The side rail stays visible so they can navigate away, exactly like the ban and VPN notices.
- Pressing Re-check runs the checks again; once clean, the page appears immediately.

Admins, management, staff and moderators are exempt so moderation is never locked out.

## Technical notes

- New `src/hooks/use-adblock.tsx`: module-level shared detector with a short session cache, a `recheck()` export, and the same listener pattern as `use-visitor-vpn.tsx`. Returns `checking | clean | blocked`.
- New `src/components/app/AdBlockGate.tsx`: wraps page content, renders the notice panel when blocked, passes children through otherwise, and skips the gate for staff roles via `useAuth().hasAny`.
- `forum.$board.tsx` and `forum.$board.$topic.tsx` wrap their main content in `AdBlockGate`, keeping the side rail outside the gate.
- `RotatingAffiliateBanner.tsx` reports an image load failure to the detector via an `onError` handler; no other change to its behaviour.
- Bait request goes to a local path under `/api/public/` so no third-party host is involved.
