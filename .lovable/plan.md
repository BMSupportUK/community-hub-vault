# Windows BM Player: no sound and full screen not filling the PC

## What I found so far
- Sound: each screen keeps its own sound setting. The first screen is meant to start at full volume and any extra screens start silent. Moving from the small preview to full screen reuses the same running channel, so if the preview started silent, the full-screen picture may keep that silence. This is my best guess, not confirmed yet.
- Full screen: the ⛶ button and the F key ask Windows to make the app full screen. The app opens maximised first, and on Windows a maximised window sometimes doesn't fill the whole screen, leaving the taskbar or a border showing. Not confirmed yet.

## Plan
1. Check your Windows player's reports from today for sound and picture-size details, so I know the real cause before changing anything.
2. Sound fix: whenever a single channel plays, or the preview opens into full screen, that screen always gets sound at your chosen volume. Silence stays only for the extra screens in multi-screen.
3. Full-screen fix: un-maximise the window before going full screen, then make the watch screen fill the whole monitor (edge to edge, over the taskbar). Restore the maximised window when you leave full screen.
4. Add tests for both rules: a single playing channel is never silent, and full screen covers the whole monitor size.
5. Run all Windows player tests, then release Windows 0.4.130.

## Not checked
I can't play sound or test full screen on a real Windows PC, so you'll need to confirm both on yours after the release.

## Technical details
- `electron/embedded-vlc.cjs`: initial `wantVolume` (index 0 → 100) and the reused-session path in `main.cjs` play IPC; force audible volume for single-screen/preview→full-screen.
- `electron/main.cjs` `fullscreen` IPC: `unmaximize()` before `setFullScreen(true)`, re-`maximize()` on exit; verify `.watch-screen.is-fullscreen` uses 100vw/100vh with no header offset.
- Mac is unaffected (different engine) and won't be changed.
