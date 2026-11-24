# Fix catch up Forward/Back going black on Windows (and Mac)

## What's wrong
When you press Forward or Back in catch up, the player waits 1.5 seconds and then restarts the programme at the new time. Before it restarts, it throws away the whole picture window instead of just stopping the stream. The new picture window it makes is never given a place or size on the screen, so you get a black screen. The sound and stream may well be running behind it.

The box doesn't do this, which is why it only happens on PC.

## The fix
- When you skip, keep the existing picture window and just switch it to the new point in the programme. Every other restart in the player already works this way, for example reconnects and swapping channel.
- Keep the same buffer, sound and graphics settings the programme started with, so a skip doesn't change picture quality or volume.
- Add an automatic check that a skip never removes the picture window.

## Release
Build Windows 0.4.141 and Mac 0.1.135 once you've approved this.

## Technical details
- `windows-bm-player/electron/main.cjs` catchupSkip handler: remove `engine.stop(index)` (it calls `destroy(s.hwnd)` and deletes the surface; `surface(index)` then creates a fresh HWND with no layout rect, because the renderer only re-reports positions that changed). `engine.play` already calls `media_player_stop` itself.
- Pass the same play options as the first start (`multi`, `steady`, `buffer`).
- Extend `tests/catchup-control.test.cjs` to assert that skip doesn't call `stop` and the surface is kept.
