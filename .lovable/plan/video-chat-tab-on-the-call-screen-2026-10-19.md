# Video + Chat tab on the call screen

## What changes
While a video call is live on a secure order page, the full-screen call gets two tabs at the top:

- **Video** — the call as it is today (unchanged).
- **Video + Chat** — the call on the left, the order chat on the right, so both people can watch and type at the same time.

This works for both sides:
- **Staff** (Secure Order Page): chat with the customer beside their camera picture.
- **Customer** (secure checkout): chat with BM Support beside the call.

On phones the two sit stacked instead (video on top, chat underneath with its own typing box), so nothing gets squashed. The tab you pick is remembered for that call only. Mute, camera, flip and end-call buttons stay on the video side.

## What stays the same
- The video connection itself, camera handling and rotation fix are not touched — only the screen around it.
- It's the same chat as the order chat bubble, so messages appear in both places.
- The chat bubble is hidden while the Video + Chat tab is open, so it doesn't sit over the call.

## Technical details
- Add a layout wrapper around `VideoCallStage` in `OrderVideoCall.tsx` (customer + staff stages) with a tab switch; the stage component is rendered once and kept mounted when switching tabs so the WebRTC connection and video elements aren't rebuilt.
- Right pane renders `StaffCheckoutChat` (orderId, token) for staff and `CustomerCheckoutChat` (token, password) for the customer; pass needed props from `admin-secure-page.tsx` / `pay.$token.tsx`.
- Responsive: `md:` grid two columns, below `md` a column with bounded heights inside the dynamic viewport.
- Video code is locked; this edit is the explicitly requested exception and limited to layout.

## Verification
- Build clean; Playwright check of both pages at desktop and phone width with the tab switching, confirming the video element isn't remounted.
