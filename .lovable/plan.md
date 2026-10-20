# Staff group video help on secure orders

## Goal
More than one staff member (staff, admin, management) can be on the same customer video call. Staff see who else is on the call, and any staff member can ask admin/management for help with one button. The customer's side stays exactly as it is now.

## What staff will see
- **Staff on this call** box (staff only, never shown to the customer): lists every staff member currently watching, with role pill and when they joined.
- **Request admin/management help** button in that box. It sends an alert to admin and management saying "Help needed on video call — order #REF". It's greyed out for 2 minutes after being pressed, and shows "Help requested · waiting" until someone joins.
- **Join call** on the incoming-call banner of the secure order page, for a second staff member, while a call is already live. Tapping the help alert opens the order and joins directly.
- Everyone who joins later sees and hears the customer. Staff cameras stay hidden and staff mics stay muted, as now.

## What does not change
- The customer's call screen, buttons, Video + Chat tab, rotation handling and how the customer's picture is sent are untouched.
- The first staff member's call to the customer works exactly as it does now.
- One staff member leaving never ends the call for anyone else.
- Ticket video calls are not touched.

## How it works (plain)
Each staff member gets their own separate link to the customer's call. Leaving only closes that person's link: the customer and every other staff member stay connected. The call only ends when the customer hangs up or the last staff member leaves. If the person who answered first leaves, the next staff member on the call becomes the one shown to the customer as "BM Support", with no break in the call.

## Technical details
- New staff-only realtime topic per session: `video-call-staff-<sessionId>` with presence (user id, name, role) for the "Staff on this call" list. Only signed-in staff roles subscribe.
- Each extra staff member gets their own customer connection on a per-viewer topic `video-call-<sessionId>-<staffUserId>`; the customer page opens one extra hidden send-only connection per viewer, reusing the same camera stream (no extra camera capture, no change to the fixed-size canvas or rotation handling). The customer's main `VideoCallStage` connection is untouched.
- Staff leaving closes only their own connection and presence entry. Ending the whole session (`endLiveHelpStaff`) only runs when no other staff remain in presence; otherwise it just removes that viewer. If the main staff connection leaves, the longest-present remaining staff member is promoted and the customer's main connection renegotiates to them.
- `joinLiveHelp` relaxed for already-live sessions: second staff join records as viewer instead of erroring; server checks `canTakeVideoCalls` roles.
- New server function `requestVideoCallAssistance({ sessionId })`: staff-role check, rate limit 1 per 2 min per session, inserts `staff_notifications` (kind `live_help_assist`, audience admin/management, link `/admin-secure-page?order=…&call=…`). Add it to notification categories and sounds list (reuse live-help voice).
- Tests: role rules for who can join as viewer and who can request help; rate limit.
- Not verifiable by me end-to-end: needs three real devices.
