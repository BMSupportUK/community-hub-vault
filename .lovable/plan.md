# Swap channel in BM Player

Customers get a **Swap channel** option while watching live TV, so they can move from a buffering channel to a working one without going back to the guide.

## What the customer sees
- A **⇄ Swap channel** button on the full-screen player controls (Android/Amazon, Windows, Mac), next to Report a problem.
- When the channel buffers 3 times in 2 minutes, the player offers it automatically: "This channel is struggling — swap to another?" (this widens today's DAZN-only "Try another feed" to every live channel).
- The swap list shows, in order:
  1. **Same event** channels (when opened from the Sports Guide) — e.g. other Sky / DAZN / club feeds for that game.
  2. **Same channel, other versions** — e.g. Sky Sports Main Event UHD / FHD / HD / SD, matched by name from the playlist.
  3. Channels marked **Not working** (the cross from channel status) are greyed out with "Not working — try another".
- Picking one plays it straight away in full screen; "Keep watching" closes the list.
- A swap is never saved to Recently watched as a separate entry for the failed channel, and it does not count as a buffering report on the new channel.

## Reporting
- Each swap is sent with the existing buffering report (from-channel, to-channel, reason: manual or automatic) so the admin Buffering page can show "Swapped away" counts per channel. The original channel also gets a health report so the Sports Guide cross appears for others sooner.

## Releases
Android 3.82, Windows 0.4.32, Mac 0.1.42 and a small website update for the Buffering page.

## Technical details
- Shared matcher: new `channelVariants(name, catalog)` (strip quality tags UHD/4K/FHD/HD/SD/50fps, country prefixes, NFKC) in website `src/lib/player-channel-variants.ts`, mirrored in Android `ChannelVariants.java` and desktop `channel-variants.cjs`; tests on each.
- Android: `PlayerActivity.offerFeed()` generalised to `offerSwap(auto)`; merges `event_alternatives` with variants from the live catalogue passed by `MainActivity`; unavailable ids come from the Sports Guide health payload. Swap button added to the controls overlay; D-pad focusable list.
- Desktop: `main.cjs` `rec.offerFeed` applies to all live channels; new `swap` IPC (catalog-verified ids only, never URLs); renderer `alternate-feed` modal renamed to swap list with greyed entries and a control-bar button.
- Server: `player.ts` buffering action accepts optional `swapped_to`, `swap_reason`; migration adds nullable columns to `player_buffer_events`; `player_buffer_diagnostics` returns swap counts.
- Catch up and films/series are unaffected.
