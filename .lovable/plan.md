# Live "Show Us" support sessions (camera-only, inside secure orders)

## What it is
A customer having install trouble starts a live session **from their secure order page** — the same password-gated checkout/order pages they already use. They point their phone camera at their Android box or Fire Stick TV, and staff watch live and talk them through it. No screen sharing, no app rebuilds — just the phone camera, which works on every phone. The feature exists **only inside the secure orders area** — no link anywhere else in the app.

```text
Customer side (secure order page)      Staff side
Order page → Get Live Help button  →   Order's admin view shows "Live help requested"
Point camera at the TV/device      →   Join → large live camera view
Small chat box in the session      ←→  Chat back, drop "press here" pointer
Red "Staff can see you" bar + Stop     End session, add a short note
```

## Customer experience
1. On their secure order page (the existing password-gated checkout link), a **Get Live Help** button appears.
2. Pressing it starts a session tied to that order and waits for a staff member to join.
3. When staff join, the phone asks for camera permission; the customer accepts and the rear camera opens.
4. A red "Staff can see your camera" bar stays on screen the whole time, with a **Stop** button.
5. A small chat box lets them type while the camera runs.

## Staff experience
- On the order's admin view, a **Live Help** section shows when a customer has requested a session, with a sound alert.
- **Join** opens a large live view of the customer's camera, plus the chat.
- Staff can tap the view to drop a pointer circle the customer sees ("press here").
- **End session** closes it. Staff can add a short note recording what the problem was, saved against the order.

## Privacy and safety
- The camera only starts after the customer presses a button and accepts the phone's permission prompt.
- Video goes straight between the customer and staff where possible. It is **not recorded or saved**.
- Sessions expire after 30 minutes and are logged (who, when, how long).
- Only someone with the order's existing password-gated access can start a session. Only staff can view one.

## Technical details
- WebRTC peer-to-peer video using the rear camera (`getUserMedia` with `facingMode: "environment"`). Signalling over a dedicated realtime channel per session (unique topic, so it doesn't touch the locked Talk/ticket code).
- New tables: `order_support_sessions` (order_id, customer token, staff user, status, timestamps, note) and `order_support_session_messages`. RLS mirrors the existing order checkout access rules; staff access via existing role checks.
- Sessions attach to the existing `order_checkout_links` access model — the same credentials that open the order open live help.
- A TURN relay is needed for mobile networks that block direct connections. This needs a TURN provider account (for example Cloudflare Calls or Twilio) and its key, which you'll be asked for.
- UI lives in the existing secure checkout/order page component and the order admin card — no new public routes.
