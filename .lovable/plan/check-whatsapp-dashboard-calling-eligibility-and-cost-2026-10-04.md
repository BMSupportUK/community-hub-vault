# Check WhatsApp dashboard calling eligibility and cost

## What the check will establish

- Confirm whether BM Support’s WhatsApp Business account and +44 number qualify for Meta’s Calling API.
- Confirm whether customer-initiated video calls can be answered inside the secure orders dashboard.
- Read the account’s actual calling status and current UK rates before recommending implementation.
- Provide a clear monthly estimate based on expected call count and average duration.

## Current findings

- A normal WhatsApp app call cannot be embedded into the dashboard by adding a relay alone.
- Dashboard playback requires Meta’s separate WhatsApp Business Calling API and a WebRTC calling integration.
- Meta requires the number to use Cloud API, the account to be business-verified, calling to be enabled, and a messaging limit of at least 2,000.
- No WhatsApp Business connection is currently available to this project, so this account’s eligibility cannot yet be confirmed.
- Cloudflare TURN currently includes 1,000 GB per month free, then costs $0.05 per GB. This relay cost would likely be £0 for normal support usage, but it does not replace Meta Calling API approval.
- Published UK pricing shows customer-initiated calls at $0.00 per minute and business-initiated calls around $0.0099 per minute, before any provider platform fees. The connected account’s rate card must be checked before treating this as final.

## Next step

Connect the BM Support WhatsApp Business account, then inspect its phone-number status, calling availability, business verification, messaging limit, and live UK rate card. If eligible, produce the exact implementation and operating-cost plan; if not, identify the specific missing approval or account requirement.
