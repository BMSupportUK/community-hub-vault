# Demo videos: new customer purchase and existing customer renewal

## What you'll get
Two screen recordings (MP4, 1280x800), saved to your Files. You can use them as "How to buy" and "How to renew" demos.

1. **New customer: how to buy**
   - Opens the shop, picks a package, and chooses Square (card) at checkout.
   - Lands on the order's secure checkout page and pays in the right sidebar with a test card (test mode, so no real money moves).
   - Shows the "Payment received" screen and the install guides card.
   - A staff account then moves the order to account setup, adds the login details, and completes the sale. The customer's view shows each step and the chat messages.
2. **Existing customer: how to renew early**
   - A customer with an active subscription buys a renewal.
   - Pays on the secure checkout page.
   - Staff enter the renewal expiry with "Early renewal" ticked, so the new months are added on top of the time left.
   - The customer sees the "Renewal completed" screen and the new expiry on their account.

## How it's done
- Uses the preview in test mode with the test card 4242 4242 4242 4242.
- Uses two throwaway demo accounts ("Demo New Customer" and "Demo Renewal Customer") with no real emails. The renewal account gets a saved service login that has time left.
- Short pauses between steps so viewers can follow along. Nothing personal appears on screen.
- The staff steps run as a separate staff session and are cut into the same video.

## Cleanup
Afterwards, both demo orders, their checkout pages, chats, credentials and the demo accounts are deleted, so your orders, profit figures and credentials lists stay clean.

## Technical details
- Playwright with `record_video_dir`, one context per role, then ffmpeg to join the clips and convert WebM to MP4. The output goes to `/mnt/documents/demo-new-customer.mp4` and `/mnt/documents/demo-renewal.mp4`.
- Demo users are created with the admin client and given the member/subscriber roles. The staff steps use your own admin session.
- Nothing in the app's code changes. If the flow breaks along the way, I'll report it before fixing anything.
