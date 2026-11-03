# Mac BM Player rules
- The Mac app reuses the Windows player's main process, preload, renderer and core logic (platform-switched on `darwin`); change shared behaviour in `windows-bm-player/`, never fork a copy here.
- Playback runs in the renderer `<video>` (hls.js for .m3u8, mpegts.js for .ts/live, native for files) behind the EmbeddedVlc-shaped `MacEngine`; the renderer only sees `bmstream://<token>` proxy addresses, and HLS playlists are rewritten so segments and keys never expose provider URLs.
- Catch up recordings must play as finite streams (`live: false` from the main process): mpegts live mode has no length, no seek bar and drops the start of the recording.
- Packaging is done on Linux: `@electron/packager` darwin arm64 + x64, merge Mach-O files with llvm-lipo into one universal app, ad-hoc sign with rcodesign, then zip with symlinks kept (`zip -y`). Upload the zip before registering the "BM Player for Mac" app-build row; it is served only through `/api/public/player-mac`.
- Without Apple Developer ID signing, customers have to right-click and choose Open the first time; keep that step on the download card until notarised releases exist.
