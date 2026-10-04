# Live "Show Us" support sessions (camera-only)

## What it is
A member having install trouble starts a live session from the secure dashboard, points their phone camera at their Android box or Fire Stick TV, and staff watch live and talk them through it. No screen sharing, no app rebuilds — just the phone camera, which works on every phone.

```text
Member side                          Staff side
Get Live Help → Start session   →    Live Help page lists waiting sessions
Point camera at the TV/device   →    Join → large live camera view
Small chat box in the session   ←→   Chat back, drop "press here" pointer
Red "Staff can see you" bar + Stop   End session, add a short note
```

## Member experience
1. In the secure dashboard: **Get Live Help**, then **Start a session**.
2. They get a 6-digit session code and wait for a staff member to join.
3. When staff join, the phone asks for camera permission; the member accepts and the rear camera opens.
4. A red "Staff can see your camera" bar stays on screen the whole time, with a **Stop** button.
5. A small chat box lets them type while the camera runs.

## Staff experience
- A new **Live Help** page in the admin area lists waiting sessions, with a sound alert.
- **Join** opens a large live view of the member's camera, plus the chat.
- Staff can tap the view to drop a pointer circle the member sees ("press here").
- **End session** closes it. Staff can add a short note recording what the problem was.

## Privacy and safety
- The camera only starts after the member presses a button and accepts the phone's permission prompt.
- Video goes straight between the member and staff where possible. It is **not recorded or saved**.
- Sessions expire after 30 minutes and are logged (who, when, how long).
- Only approved members can start a session. Only staff can view one.

## Technical details
- WebRTC peer-to-peer video using the rear camera (`getUserMedia` with `facingMode: "environment"`). Signalling over a dedicated realtime channel per session (unique topic, so it doesn't touch the locked Talk/ticket code).
- New tables: `support_sessions` (member, staff, status, code, timestamps, note) and `support_session_messages`. RLS: members see only their own sessions, staff see all.
- A TURN relay is needed for mobile networks that block direct connections. This needs a TURN provider account (for example Cloudflare Calls or Twilio) and its key, which you'll be asked for.
- Routes: a member page under `_authenticated/_approved/live-help`, and a staff page under the admin area.
