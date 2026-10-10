# Project Memory


## Core
User emails are visible only to admin and management roles. Hide email fields from all other users in every UI surface (profiles, members directory, orders, ticket views, admin pages, etc.).
/sports-guides is FROZEN — do not modify sports-guides routes, components, or `src/lib/parse-event-times.ts` unless user explicitly requests a sports-guides change.
Chat/presence counters are LOCKED — never change the presence hook, side rail count, "in chat" pill, or Members panel count without explicit authorisation.
Boro score predictions = Championship (league) fixtures ONLY. Never let cup ties, play-offs or friendlies into that game.


## Memories
- [Profit and costs presentation](mem://design/profit-costs.md) — Visible background, professional finance layout and right-sidebar pie statistics
- [BM Support App Store installation videos](mem://features/app-store-install-videos.md) — Android TV, Amazon Fire TV, and iPhone Purple Player guides, secure-code naming, narration and privacy rules
- [Admin owner tools](mem://features/admin-owner-tools) — Theme and Header links live inside Owner tools; Orders keeps the admin Add manual order action
- [Profit payment groups](mem://features/profit-payment-groups) — Crypto is grouped under NOWPayments; bank transfers are grouped under Wise in Profit & costs
- [SECURITY DEFINER allowlist](mem://security/security-definer-allowlist) — Functions that must remain executable by `authenticated`; safe to ignore lint 0029 for them
- [Sports guides frozen](mem://constraints/sports-guides-frozen) — Do not touch sports-guides routes or parser without explicit request
- [Chat counters locked](mem://constraints/chat-counters-locked) — Frozen presence engine + all chat counter surfaces, expected behaviour per counter
- [Boro team sheets locked](mem://constraints/boro-team-sheet-locked) — Frozen X team-sheet pipeline posting Boro + opposition XI into match-day threads; never narrow detection patterns
- [Page permissions](mem://features/page-permissions) — page_permissions semantics, `_approved` route guard and side-rail gating
- [Boro predictions league-only](mem://constraints/boro-predictions-league-only) — Championship-only predictor: filters, upsert guards and DB trigger that must stay

- [Sports import formats](mem://features/sports-import-formats) — Permanent provider layouts including WST snooker; every format requires regression, safety, and round-trip checks
- [Affiliate banner shape](mem://design/affiliate-banner-shape) — Wide banners use a shallow 3:1 shape and preserve the full artwork without cropping
- [Location mandatory for direct sign-ups](mem://constraints/location-mandatory-signup) — No opt-out or appeal until GPS shared; referral/Fan Zone bypass
- [Day and date before shift time](mem://preferences/date-before-time) — Shift times read "Mon, 5 Oct · 09:00 – 19:00"; different days stay on one line joined by a glowing divider
- [Member home hero spacing](mem://design/member-home-hero) — Welcome copy large and evenly spaced; subscription box closes the space beneath it, capped, compact on phones
- [Working Status break row above next shift](mem://design/working-status-break-order) — Live break timer renders above the Next shift panel

- [Seasonal Talk effects](mem://features/seasonal-talk-effects.md) — Halloween all October, Christmas snow all December (UK time), Talk channels only
