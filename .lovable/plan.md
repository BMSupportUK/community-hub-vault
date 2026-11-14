# Connection strength on Viewing stats

Add a signal-strength indicator to each customer's Viewing stats so staff can tell whether problems come from slow internet or from the channel.

## What staff will see
- In each day tab's Details table, every watched item gets a **signal-bars indicator** (4 bars) plus a label: **Strong**, **OK**, **Weak** or **Very weak**, and the average speed (e.g. "18 Mbps").
- Beside it: **number of buffers** and **total time frozen** for that item that day.
- A short reason line when it's clear:
  - Low speed + buffering = "Customer's internet too slow"
  - Good speed + buffering = "Likely channel/provider issue"
- The day's Summary shows one overall strength badge for the whole day.
- Hovering the bars shows lowest, average and highest speed seen.

## Strength levels (per item, based on average speed vs what the stream needs)
- Strong: 25 Mbps+ (or at least 3x the channel's bitrate)
- OK: 10–25 Mbps
- Weak: 5–10 Mbps
- Very weak: under 5 Mbps
Thresholds can be changed later if you prefer different numbers.

## Where the speed comes from
- BM Player (Android, Windows, Mac) already sends a "still watching" update every minute. It will also send the download speed it measured over that minute and the stream's bitrate. Previews stay excluded.
- Buffering counts come from the buffering reports the player already sends.
- Only new watching gets a speed reading — needs a new Android build and new Windows/Mac builds. Older app versions show "No reading".
- Records still clear after 7 days, same as now.

## Technical details
- Migration: add `speed_kbps_sum`, `speed_samples`, `speed_min_kbps`, `speed_max_kbps`, `bitrate_kbps` to `player_customer_daily_stats`; extend `record_player_watch_activity` to accept optional speed/bitrate and accumulate per day row (still split across UK midnight).
- Admin-only RPC/read joins daily rows with `player_buffer_events` (same user/device/content/day) for buffer count and `stall_ms` total.
- `src/routes/api/public/player.ts`: accept and clamp the new optional fields.
- Android: measure bytes received per minute from libVLC stats (`readBytes`/`inputBitrate`) and Media3 bandwidth meter; include in watch heartbeat. Windows/Mac: mpv `cache-speed`/`demuxer-bitrate`.
- `src/lib/player-customer-stats.ts`: pure `connectionStrength(avgKbps, bitrateKbps)` + diagnosis helper, with bun tests for each threshold.
- `PlayerCustomerStats.tsx`: bars component using design tokens.
- Release: Android 5.33, Windows 0.5.00, Mac 0.1.103 — built but only made public when you say.
