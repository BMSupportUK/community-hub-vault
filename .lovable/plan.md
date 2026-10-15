# Add screen sharing to Live Help sessions

## What it is
During a live help session, the customer shares **their own device's screen** live, so staff watch exactly what they're doing while installing our app — every tap, menu and error message. Staff see it live in the session view and can point at what to press. Nothing is recorded.

## Customer side (`LiveHelpCustomer.tsx`)
- Two toggle buttons in the session bar: **Camera** and **Share screen**.
- Share screen uses the phone/browser's built-in screen picker (`getDisplayMedia`). The browser shows its own "you are sharing your screen" warning, and the red "Staff can see your screen" bar stays on the whole time.
- Switching swaps the video track on the existing connection — the session, chat and pointer keep working without reconnecting.
- Pressing **Stop** (or the browser's own "stop sharing" button) ends sharing; the session can fall back to the camera or end, customer's choice.
- Screen sharing works on Android Chrome and desktop browsers. iPhones/iPads can't share their screen to a browser — on those the button is hidden and camera help stays available.

## Staff side (`LiveHelpStaff.tsx`)
- The big video view just shows whatever the customer is sending — camera or screen — with a small label saying which ("Customer's camera" / "Customer's screen").
- The tap-to-point feature keeps working on the shared screen too, so staff can point at the exact setting to press.

## Technical details
- No new tables or server changes: the existing WebRTC peer connection and `live-help-<id>` broadcast channel carry it. Screen share is a track swap (`replaceTrack`) plus a renegotiation offer over the existing signalling.
- New broadcast event `source` (`camera` | `screen`) so both sides show the right label and red-bar wording.
- `getDisplayMedia({ video: true, audio: false })`; on `track.onended` (browser stop button) the customer side broadcasts the change and offers camera fallback.
- iOS detection hides the Share screen button (`getDisplayMedia` unsupported).
- The existing 30-minute expiry, privacy rules and staff-only viewing are unchanged.

## Verification
- Type-check + build.
- Browser test of a session: camera → switch to screen → staff label updates → stop sharing → back to camera.
