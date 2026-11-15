# "Always use Private DNS for channels" setting

## What you'll get
- A new switch in BM Player Settings, under Private DNS: **Always use Private DNS for channels**. It is **Off** by default.
- When it's On, every channel the box opens looks up its stream server through Private DNS straight away, instead of only after a normal lookup fails.
- If the private lookup fails, or the channel uses a secure (https) link, the box uses a normal lookup so the channel still plays.
- The Live connections page already shows a "Private DNS" stream tag, so you'll be able to see it working on your box.
- Released as BM Player 5.67 so you can test it on your own box first.

## Technical details
- `MainActivity` Settings: add a toggle saved as the `pdns_streams` pref, shown only while Private DNS is On, with a short plain-English explanation of the trade-off (possible extra buffering).
- `StreamDns`: add `preferPrivate(url)`. For plain-HTTP URLs, it resolves the host through `PrivateDns.resolve` and rewrites the URL to that address, sending the original Host header to the player. It returns null on failure or for https links.
- `BackupPlayerActivity` and the main live playback path: when `pdns_streams` is set, call `preferPrivate` before opening the stream and set `np_dns=true` when it's used. The existing failure-retry stays unchanged.
- Unit tests in `PrivateDnsTest`/`StreamDnsTest`: https links are left alone, Off by default, and a failed lookup falls back to the original URL.
- Bump to 5.67, build, run the Android tests, then publish via the `bm-player/` build row.
