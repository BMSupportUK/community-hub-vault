# Two-way live video help calls

## What it is
Staff and customer can see and hear each other live inside the site, like FaceTime. The customer can flip to their back camera to show their TV, box or phone while they install the app. Nothing is recorded.

## Where it's started
- **Secure order page**: a "Start video call" button for the customer. Staff see the call in the order's chat panel.
- **Support tickets**: a "Video call" button in the ticket. Either side can start the call and the other side gets a ringing pop-up with Answer / Decline.

## The call screen (both sides)
- Big video of the other person, a small preview of yourself in the corner.
- Buttons: mute mic, camera on/off, **flip camera** (front/back), end call.
- A red "Live video call" bar stays on the whole time.
- Works on phones and computers, iPhone included. The camera and mic ask for permission first.
- Calls only start during opening hours, and only staff, admins and management can take them. Every call is logged on the order or ticket (who joined, start and end time). There's no video in the log.

## Rule change you're approving
Right now the project rule says customer camera sessions are never built into the site, and video help goes through WhatsApp. This plan replaces that rule with in-site two-way calls. The WhatsApp button stays as a backup.

Your ticket screens are locked. Adding the Video call button means I'll need to change them. That's the only change I'll make there.

## Technical details
- Reuse the unused `LiveHelpCustomer` / `LiveHelpStaff` WebRTC code and `live-help.functions.ts` sessions. Make them two-way: both sides `getUserMedia({video, audio})` and add their tracks. Flip camera uses `replaceTrack` with `facingMode` switch.
- Signalling stays on a unique realtime topic per session. Add `ringing/accepted/declined` events and link sessions to either order_id or ticket_id (migration adds nullable `ticket_id` + check).
- STUN alone fails on many mobile networks. Add a TURN relay (e.g. Cloudflare Calls TURN or Metered). A short-lived credential comes from a server function, and the API key is stored as a secret that I'll ask you for.
- Server checks the role for staff join, the order/ticket owner for the customer, and `is_business_open`.
- Update the AGENTS.md rule replacing "never embed customer camera sessions".

## Verification
- Type-check + build; tests for who may join/start a call.
- A test in two browser windows: ring, answer, both videos show, mute and flip, end, and the log entry.
