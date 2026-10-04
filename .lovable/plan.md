# Live "Show Us" support sessions

## What's possible
- **Phone web browsers (iPhone and Android) cannot share their screen.** Apple and Google block it in browsers. Only computers can do it from a website.
- **The BM Support Android app can share the screen**, using Android's built-in "Start recording or casting" prompt.
- **Fire Sticks and TVs can't share at all.** For those, the member points their phone camera at the TV.

So the plan gives each member the best option for their device:

```text
Member device            How they show us
Android (BM app)         Real screen share
iPhone / phone browser   Live camera pointed at the screen/TV
Computer                 Real screen share from the browser
Fire Stick / TV          Phone camera pointed at the TV
```

## Member experience
1. In the secure dashboard: **Get Live Help**, then **Start a session**.
2. They get a 6-digit session code and wait for a staff member to join.
3. Once staff join, they choose **Share my screen** or **Use my camera**. Only the options that work on their device are shown.
4. A red "Staff can see your screen" bar stays on screen the whole time, with a **Stop** button.
5. The member can type in a small chat inside the session.

## Staff experience
- A new **Live Help** page in the admin area lists waiting sessions, with a sound alert.
- **Join** opens a large live view of the member's screen or camera, plus the chat.
- Staff can tap the view to drop a pointer circle the member sees ("press here").
- **End session** closes it. Staff can add a short note to record what the problem was.

## Privacy and safety
- Sharing only starts after the member presses a button and accepts the phone's own permission prompt.
- Video goes straight between the member and staff where possible. It is **not recorded or saved**.
- Sessions expire after 30 minutes and are logged (who, when, how long).
- Only approved members can start a session. Only staff can view one.

## Phases
1. **Camera + computer sharing** (works on every phone right away).
2. **Android app screen share** (needs a new APK build that members reinstall).

## Technical details
- WebRTC peer-to-peer video. Signalling over a dedicated realtime channel per session (unique topic, so it doesn't touch the locked Talk/ticket code).
- New tables: `support_sessions` (member, staff, status, code, timestamps, note) and session chat messages. RLS: members see only their own sessions, staff see all.
- A TURN relay is needed for mobile networks that block direct connections. This needs a TURN provider account (for example Cloudflare Calls or Twilio) and its key, which you'll be asked for.
- Uses `getDisplayMedia` on desktop and `getUserMedia({ video: { facingMode: "environment" } })` for the rear camera on phones.
- Android: a native MediaProjection screen-capture plugin added to the existing app wrapper, then a rebuilt APK.
- Routes: a member page under `_authenticated/_approved/live-help`, and a staff page under the admin area.
