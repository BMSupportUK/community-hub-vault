# Protect the streams: blocking, link sharing, dropouts

## 1. Broadband blocking
- Private DNS (5.63) already covers channel-list and guide lookups.
- Extend it to the stream lookups too: when a channel opens, its server address is looked up through Cloudflare/Google first, then the normal lookup as fallback (3-second limit, nothing stops playing).
- If a stream fails straight away with a "blocked"-looking error (connection reset, refused, redirect to a block page), retry once using the HTTPS address if the provider offers one.
- Limit: a provider that blocks by the server's IP address (not its name) can only be beaten by a VPN or relay, which you ruled out.

## 2. Link sharing
- Stream links are never shown in BM Player: remove any "copy link"/show-URL spots and keep external players off by default (already the rule).
- Saved logins stay sealed on the box (already done); add: the box refuses to hand the login to an app that isn't signed with the BM key.
- Website side: flag an account when the same login is playing from more places than its screen limit, or from a device that isn't linked (uses the existing connection-limit report). Staff see it on Live connections.
- Limit: the provider's own server address is what customers can copy if they sniff traffic; true protection needs the provider to use short-lived tokens.

## 3. Dropouts
- Already in place: reconnect on no data (8 s), sound loss (8 s), backoff retries.
- Add backup-channel switch: if the same channel fails to reconnect 3 times in 2 minutes, the box automatically opens the matching backup channel (same name, other quality or other category, e.g. "Sky Sports Main Event FHD" -> "HD" / "UHD"), shows a small "Switched to backup" notice, and tries the original again after 10 minutes.
- Blocky picture: if the box sees lots of damaged frames for 10 s, reopen the channel.
- Website: each switch is recorded in the Details tab of the customer's connection history with the cause.

## Release
- Build BM Player 5.64, run all tests, publish; website changes go live on publish.
- Windows/Mac players get the backup-channel switch in a later update.

## Technical details
- `tv-player`: new `StreamDns.java` (DoH resolve for libVLC/Media3 via custom DNS), `BackupChannel.java` pure matcher + tests, `LiveReconnect` gains failure counter, libVLC `corrupted`/`lost pictures` stats for blockiness.
- `src/routes/api/public/player.ts`: accept `backup_switch` event into `player_connection_sessions`.
- Login hand-off check via signature verification in the existing external-player path.
