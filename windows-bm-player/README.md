# BM Player for Windows

Windows 10/11 x64 executable installer. Run `BM-Player-Windows-0.2.3.exe` to install BM Player with its included playback runtime, Start menu/desktop shortcuts and uninstaller. The approved Windows release has its own Install Guides pill and logged download endpoint, separate from Android updates. The installer is unsigned and remains a private test download only.

Every fresh opening requires the linked customer's six-digit account number, verified by BM Support before content or playback is available. Neither the entered number nor the successful unlock is persisted. Wrong-number attempts preserve the device link and use the website's shared attempt limit.

## Included
Device-code linking through BM Support, same Live TV/Films/Series home tiles and artwork, section preload/refresh, local category filtering, latest-added sort, posters, series seasons and episodes, film/episode resume and watched bars, favourites and adult-filtered history, two-hour programme grid, future-only confirmation reminders, sports category hierarchy/channel matching, report-a-problem details, multi-screen up to the provider connection allowance, account expiry and maintenance, speed test, change-login confirmation, connection investigation reporting and timed inactivity exit.

Credentials/device token are protected by Electron safeStorage and never sent to the renderer. Bundled libVLC renders into BM Player's own native video surfaces through Koffi 3.3.6; no external VLC executable or HTTP control server is launched. Provider URLs are derived from the locally stored login, and every website call uses the existing player device-token endpoint. Official VLC 3.0.21 Windows x64 archive SHA-256: `a0b7ec02b50adf6417eed014fb8df50af39690505a4225b85b3dc2ed17d14843`.

## Test limitations
The Windows executable, native HWND rendering and actual stream/4K playback cannot be run in this Linux sandbox. Renderer interactions were checked with sample catalogue data, not a real provider login. Version 0.2.0 implements in-app VLC playback/preview with pause, resume, seek, volume, fullscreen and native-surface hiding for dialogs. Live categories and channels retain the provider order used on Android; films and series retain their own chosen sorting. Native DLL loading, rendering/DPI and actual codecs need a Windows test before this is launch-ready. Voice search and the complete Android settings set are not included yet. The guide preloads the first 15 channels and other rows load on request. Input sampling depends on Windows PowerShell and needs a real Windows check.

Inactivity uses three hours without Windows input, then an explicit Continue viewing prompt with a one-minute deadline. If unanswered, BM Player stops its VLC sessions and closes to the desktop. Android/Fire TV inactivity applies to BM Player's own activities, not external VLC.

## Build
Run `bun windows-bm-player/build.cjs` from the project root. This stages the renderer/shell in `/tmp/windows-player-build/app`. Extract the checksum-verified official VLC archive into its `tools` directory, then package with `@electron/packager@20.3.0`, Electron 41.0.2, target `win32 x64`, `--no-asar`. Archive the output with all Electron and VLC notices. Tests: `bun test windows-bm-player/tests/core.test.cjs`.