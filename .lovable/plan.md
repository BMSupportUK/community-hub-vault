# TV Remote for Staff (customer TVs)

Staff open a remote on their phone inside the Staff Portal and press buttons on a customer's Fire TV / Android TV / Google TV during a support session.

## How it works

```text
Customer TV (BM Remote Helper app)  <-- live channel -->  Staff Portal remote (phone)
      shows 6-digit code                                  staff types code, presses buttons
```

1. The customer installs the **BM Remote Helper** app on the TV with Downloader. We add a step-by-step guide to Install Guides.
2. The customer opens the app and the TV shows a 6-digit code. The code lasts 10 minutes.
3. Staff open **TV Remote** in the Staff Portal and type the code. The TV asks the customer "Allow BM Support to control this TV?" and the customer presses OK.
4. The staff member's phone shows a remote: up/down/left/right, OK, Back, Home, Menu, play/pause, volume, plus a text box for typing usernames and passwords on the TV.
5. Either side can end the session. Sessions also end after 30 minutes of no activity. A banner on the TV shows when control is active.

## Who can use it
- Admin, management and staff only. Customers never see the remote.
- Every session is logged (staff member, customer, start and end time) and shown to admin and management in the Admin Panel.

## Limits to know
- **Building the TV app is a separate job.** The app has to be a native Android TV app. I can write its full source code and put it in your Files. Building and signing the install file needs Android Studio, or I can tell you a service that does it.
- The customer must turn on the app's Accessibility permission once. Android requires this before an app can press buttons. The guide covers it.
- Newer Fire TVs running Vega OS can't run it. Older Fire OS models and Android/Google TV can.
- Staff don't see the TV screen in this first version. The customer describes the screen, or keeps the existing video help call open. Screen sharing can come later.

## Technical details
- DB: `tv_remote_sessions` table (pair code hash, device id, staff user id, status, expires_at, timestamps) and `tv_remote_events` audit table. RLS gives staff roles access and admin/management read the history. Authenticated RPCs: `claim_tv_pair_code`, `end_tv_session`.
- Public server route `/api/public/tv/pair` lets the TV app register a device and get a short-lived pair code. It returns a scoped session token, hashed at rest and rate limited.
- Commands go over a unique Realtime broadcast topic per session (`tv-remote:<session id>`). The TV app sends acknowledgements and heartbeats. None of the existing Talk, ticket or video code is touched.
- Staff page: `src/routes/_authenticated/_approved/staff-portal/tv-remote.tsx`, with a big-button layout sized for phones. It is added to the staff side rail and the Owner Tools rail order.
- TV app (Kotlin): a pairing screen, a WebSocket client to Realtime, and an AccessibilityService that maps commands to global actions and key events. A consent dialog and an on-screen "controlled by BM Support" overlay. The source goes to Files as a zip.
- Add a test for pair-code expiry and staff-only claim rules.
