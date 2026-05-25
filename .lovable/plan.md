## Goal
Make in-app notification sounds (shift start/end, break ending, ticket alerts, notification bell) louder and ensure they still play when the browser tab is in the background.

## Changes

### 1. `src/lib/sound.ts` — louder + background-friendly playback
- Raise default `volume` from `0.9` to `1.0` and add an optional gain boost via Web Audio API (`AudioContext` + `GainNode`) so we can go above the HTMLAudio 1.0 ceiling (target ~1.8–2.5x). Use Web Audio when available, fall back to plain `<audio>` otherwise.
- Set `audio.preload = "auto"`, keep cached elements, and add `playsInline` + `crossOrigin` safe defaults.
- Background playback: HTMLMediaElement keeps playing when the tab is hidden as long as it was unlocked once. Today the unlock listeners are removed after first gesture — keep that, but also:
  - Re-prime the cached audio elements on `visibilitychange` returning to visible (so iOS/Safari that suspends AudioContext resumes cleanly).
  - Resume the shared `AudioContext` on each `playSound` call if its state is `"suspended"` (common when tab was backgrounded).
- Keep the existing `playSound(src, { volume, label })` signature; add optional `gain` (default 1.8) for the boosted path.

### 2. Callers — bump perceived loudness where it matters
Pass a higher gain for critical alerts so they cut through:
- `src/components/app/ShiftStartEndAlert.tsx` — shift start/end: `gain: 2.2`.
- `src/components/app/BreakEndingAlert.tsx` — break/lunch over: `gain: 2.2`.
- `src/components/app/NotificationBell.tsx` — bell ping: `gain: 1.5` (less aggressive).
- `src/routes/_authenticated/gate.tsx` — keep default.

No volume UI is being added; this is a flat boost. If the user later wants a per-user setting we can layer it on.

### 3. Background tab caveat (documented, not coded)
Browsers throttle JS timers in background tabs, but our triggers are either:
- realtime Postgres subscriptions (push from server — fire even when throttled), or
- a 1s interval that still fires (slower, but fires).
So once the page has had one user gesture, sounds will play in the background. True OS-level background (tab closed / phone locked) still requires the existing web-push pipeline — out of scope here.

## Files touched
- `src/lib/sound.ts` (rewrite playback core)
- `src/components/app/ShiftStartEndAlert.tsx` (pass gain)
- `src/components/app/BreakEndingAlert.tsx` (pass gain)
- `src/components/app/NotificationBell.tsx` (pass gain)
