# Shake the screen as a visual alert when sound can't be used

## The honest limit
When the browser is fully closed or minimised, no website can shake the PC screen — browsers block that, same as forcing focus. But while the app is open in any tab (even a background tab you'll come back to), the page itself can shake, and that works with the sound muted or no speakers at all.

## What will change
1. **New screen-shake effect.** A short, sharp shake of the whole page (about a second) — impossible to miss when you're looking at the screen, and it respects the "reduce motion" accessibility setting so it won't affect anyone who has that switched on.
2. **Fires on every alert, sound or not.** Every alert that currently tries to play a sound (ticket replies, mentions, new tickets, break warnings, etc.) also shakes the screen. Crucially, it still shakes when sounds are muted, the volume is down, or the browser blocked the audio — that's the whole point.
3. **Push alerts included.** When a push notification arrives while the app is open, the screen shakes too, not just when the sound clip plays.
4. **Test it live.** Trigger the shake in the browser and confirm the page visibly shakes, including with sounds muted.

## Technical details
- Add a `shakeScreen()` helper (new small module under `src/lib/`) that applies a CSS shake keyframe animation to the app root for ~900ms, guarded by `prefers-reduced-motion` and a short cooldown so rapid alerts don't shake endlessly.
- Add the `shake` keyframes to `src/styles.css`.
- Call it from `playSound()` in `src/lib/sound.ts` — including the muted / not-signed-in-sound early-return paths (shake is visual, so it ignores the mute setting) — and from `PushSoundBridge.tsx` when a push message arrives.
- No changes to Talk or ticket channel code.
