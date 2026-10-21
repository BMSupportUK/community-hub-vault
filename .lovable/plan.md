# Remote TV help (RemoteHand) for Fire TV, Android TV and Google TV

## What RemoteHand is
Staff see the customer's TV screen and drive it like a remote. It has three parts: a VPN app on the TV, a small rented server you own, and a program on the staff PC (scrcpy). The customer approves every session on the TV. Fire TV works today. Android TV and Google TV are still in testing, and Vega OS isn't supported.

## What can and can't be built here
The TV app, the server and the PC program can't be built or hosted inside this website. RemoteHand already provides all three for free. So the plan is to run RemoteHand as it is and connect it to BM Support.

## Steps
1. **You (one-off, about 10 min):** rent a Debian VPS (1 CPU, 1 GB, about £5/month) and a subdomain such as `tv.bmsupport.uk`. Run the RemoteHand setup wizard on the staff PC. I can write the step-by-step for you.
2. **Staff tool in tickets and orders:** add a staff-only `/tvhelp` command. It posts a card in the chat with the Downloader code, the server name the customer should check, and a box where staff paste the 4-character code from RemoteHand.
3. **Customer guide page:** add a "Remote TV help" guide under Install Guides. It shows the steps with pictures for Fire TV (and marks Android/Google TV as "beta"): turn on ADB debugging, install with Downloader, check the server name, enter the code, accept both prompts, and turn ADB off afterwards.
4. **Session log:** keep a record of who started each session, on which ticket or order, and when it ended. Codes, screenshots and typed text are never stored.
5. **Consent text:** before staff can post the card, they tick a box confirming the customer agreed.

## Technical details
- New table `tv_help_sessions` (ticket_id or order_id, staff_id, started_at, ended_at, device_type), with RLS limited to staff/admin/management and an authenticated RPC.
- The `/tvhelp` command reuses the existing staff-only command parsing pattern, alongside `/video`. Ticket channel code is locked, so the command hook is added only with your go-ahead.
- No link to the VPS from the site's server. The site only shows instructions and the code staff type in.
