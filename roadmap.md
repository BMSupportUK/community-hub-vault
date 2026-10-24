- [x] Member name cards: male/female defaults, one-time confirmation, Talk member identity, and BM Support profile display
# Roadmap

## Member card screen sharing
- [x] Add staff-only screen-sharing icon with click-open six-digit code pop-up to Members Directory cards, reuse authorized TV pairing and existing viewer without changing order/ticket sharing.
- [x] Signed-in staff card click, six-digit typing, disabled incomplete submission and failed-code retry verified; simulated successful pairing opens the existing viewer. Twenty-four sharing tests pass, including member/subscriber exclusion; build OK.
- [ ] Verify physical TV connection and picture — requires a real device code and customer consent; no live TV session claimed during checks.

## GoCardless £1 live demo test
- [ ] Prepare a demo-only £1 GoCardless payment while retaining the customer provider — live API refused the £1 Instant Bank Pay request on 24 Oct 2026 with 403 "Creditor account not fully verified"; account reports in_review. No payment link, order or charge created.
- [ ] Verify the real payment after Dane pays; only then switch customer Open Banking to GoCardless (awaits real payment).

## Ticket screen sharing
- [x] Require a saved staff invitation for order code entry in both customer controls and the request handler; add Request screen share on the staff secure order page.
- [x] Remove the standalone customer TV Remote Helper icon/editor entry and redirect its old page to Customer Portal; signed-in redirect verified without page errors, 17 sharing tests pass. Real order invitation/TV connection remains unverified.
- [x] Show customer sharing controls to Dane on his specified open test ticket only; retain staff access on other tickets and owner-only pairing checks.
- [x] Replace inline customer code entry with one TV-code pop-up per ticket, automatically opened on a staff invitation and reopenable from the request message; successful pairing closes it and opens Screen share.
- [x] Put TV-code entry directly in the staff request message and switch to Screen share after successful pairing/connection; 24 tests pass and saved request card verified signed-in. Physical customer connection remains unverified below.
- [x] Keep the original ticket conversation as the entry view; add a dedicated Screen share tab, staff request action, customer TV-code entry and ticket-only pop-out chat. Signed-in staff request, pop-out reply and original-thread read-back verified on desktop/phone; temporary ticket removed. Ticket pairing and existing permission tests pass.
- [ ] Verify a real customer's TV-code submission, staff answer and physical TV consent/picture — requires the customer's signed-in ticket and real TV; isolated pairing/read-back passed.

## Android navigation menu
- [x] Repair duplicate order/moderation badge listeners that crash the mobile menu and uncover its Close button. Signed-in Android-touch browser verifies opening, three close/reopen cycles, Shift history navigation and reopening without errors; build OK. Saved JS browser regression could not launch its missing bundled browser; equivalent Python Playwright flow passed. Preview only; physical Android device remains unverified.

## BM Support phone app release
- [x] Build signed BM Support 1.2.8 (code 20) with TV remote setup; signature matches the previous release, five setup tests pass, download button serves identical APK bytes, build OK. Publishing requested for bmsupport.uk; deployment completion not yet verified.
- [ ] Verify Turn on against a physical Fire TV — requires an Android phone and TV on the same home network.

## Account switching and site-user manual orders
- [x] Add audited admin-only login as customer and return with an HttpOnly original-session cookie; reject pending resets, demo/staff targets and customer two-factor accounts, and revalidate admin access on return.
- [x] Allow admin/management to select a site user in the manual-order dialog; assign the order and password-free payment notification atomically. Fourteen regressions pass, authenticated picker returns 26 eligible users and preview build OK; no live orders created.
- [ ] Verify switching, returning and selected-user order creation through the UI — signed-in Customers and Add order remain blocked by the dashboard password/PIN; requires admin unlock. Customer accounts with two-factor verification deliberately cannot be impersonated.

## Same-day cover and swap approvals
- [x] Restore authorized same-day cover approvals without reopening closed rota bookings; applied database fix and isolated approval/sign-in read-back pass.
- [x] Make shift swap reassignment and approval atomic; retain duplicate-shift protection. Ten database/cutoff regressions pass; signed-in Shifts opens without errors and preview build OK.
- [ ] Verify an actual approval through the UI — requires a suitable pending cover/swap request; no real staff rota or sign-in records changed for testing.

## Project monitoring payment findings
- [x] Correct Stripe account selection in automatic and manual checks; live prefixes override sandbox config, missing resources and empty searches retry the other account. Reconciliation integration and fallback tests pass.
- [x] Display resolved settled payment methods in Orders without guessing unpaid methods; label regressions pass. Eighteen payment tests passed; preview build OK.
- [ ] Check real payment confirmation and Orders labels on screen after publishing — dashboard verification is blocked by the required password/staff PIN; no live payment created or modified for testing.

## Today's break allocation and rota booking
- [x] Dane J’s account gets breaks when working alone via the shared planner used by saved allocations and UI fallback; other staff still require cover. Existing times/records untouched; 20 break tests pass.
- [x] Repair empty saved break allocations when cover becomes available; Dane’s 11:45, 14:30 and 16:45 UK times verified on his signed-in home screen, with existing allocations and recorded breaks preserved.
- [x] Block bookings on crossed-out rota days in the UI and database; signed-in rota shows today Closed without Claim and future days with Claim. UK-midnight and break regressions: 18 tests pass.

## Open Banking profit breakdown
- [x] Align Orders payment labels with verified Open Banking and settled Wise, Square card and Crypto payments; pending alternatives cannot override actual payments.
- [x] Add display-only £1 Open Banking demo with sample fees, separate from real orders and totals.
- [x] Add Open Banking immediately before Wise with independent sales, actual provider fees, net received and year/month profit totals; identify bank payments from verified Stripe methods without changing payment records. Nineteen tests pass and preview build OK.
- [ ] Verify the real Open Banking breakdown on screen — signed-in finance page redirects to the required staff PIN gate; awaits user unlock.

## Manually added customer onboarding
- [x] Include manually added accounts before any purchase, group unfinished accounts under Manual customers, and refresh both card data sources on creation and every 15 visible seconds. Required profile completion updates names and moves the same card to its site group; admin subscription entries remain intact. Forty-six tests pass, build OK, authenticated read confirms the existing pending account is listed.
- [ ] Verify Add user, editing and customer completion through the unlocked Customers screen — blocked by the dashboard password/PIN gate; no live customer account or email created for testing.

## Manual credentials access
- [x] Restore existing-customer buttons alongside manual customer lookup in the Add order right sidebar; place the bypass-account-creation checkbox under Existing customer only and reset it when switching customer type or starting a fresh order. Preview only; screen check remains PIN-blocked.
- [ ] Verify restored Add order sidebar and checkbox on screen — signed-in navigation is blocked by the account password/admin PIN gate; no security bypass or live order created.
- [x] Add admin-only manual-order skip-account-creation checkbox to Add order and secure order sidebar, defaulting to registration; saved flag suppresses completion registration prompt, atomic create and direct-write permission guard. Twenty-one tests pass, build OK; preview only.
- [ ] Verify manual registration exception end-to-end on screen — signed-in browser reaches account password/PIN gate; requires admin unlocking. Database persistence and admin-only permission tests pass.
- [x] Move customer PIN enrollment to password-gated manual secure checkout only; identity comes from the order, existing PINs cannot be overwritten, credentials page is sign-in only. Sixteen security/access tests pass, invalid credentials access denied in browser, build OK; preview only.
- [x] Add customer-chosen six-digit PIN with existing TV-login proof for initial setup, salted PBKDF2 storage, one-hour lock after five failed PIN attempts, and atomic ten-minute sessions; eleven tests pass, real page denies invalid access, illustration renders and build OK. Preview UI awaits publishing; legacy email-only verification is disabled in the shared backend.
- [ ] Verify checkout PIN save/read-back and real credentials login in browser — existing demo order has no checkout link, real customer flow needs their secure checkout access and emailed one-use password; database setup/read-back tests pass, no real customer secrets accessed.
- [x] Restrict site credentials cards, search, counts and add targets to positively identified BM Support accounts; four tests and signed-in list/search checks pass, Boro Matchday Action excluded, build OK; preview only.
- [x] Add a manual-customer tab to User Credentials, preserving site-account tools; signed-in tab/card expansion verified.
- [x] Add private manual credentials page with automatically emailed secure access, no site-account creation; verified sender domain, public request and denied invalid password, phone layout.
- [x] Verify access isolation, expiry, rate limits and credentials read-back in isolated database tests; 47 tests passed, build OK, no real passwords logged.
- [ ] Verify actual email receipt and successful customer login/read-back — awaits customer inbox access; no customer email sent during checks.

- [x] Repair Aussie Rules malformed dual-time import and saved guide; all five fixtures verified signed-in with correct UK times and channels, publication status unchanged; 72 sports tests pass.

## Current
- [x] Add illustrated final manual-checkout account creation with required username, display name, gender and credentials PIN plus separate site password; safe demo submission and phone layout verified, invalid checkout denied, 24 tests pass and build OK. Preview only.
- [ ] Verify real final-step signup, confirmation email and account claim — needs a customer's completed secure-order access and inbox; no live customer account created during demo checks.
- [x] Keep shift sign-in buttons mounted across timer ticks, guard duplicate submissions, show immediate feedback and read back the inserted shift; show Preparing for shift before the UK start in Working Status, Time Tracking and Staff Directory. Twelve tests pass, build OK; real signed-in home status and start-time transition verified without changing live shifts. Preview only.
- [ ] Verify a fresh shift sign-in submission on screen — requesting user already has an open live shift; no live shift ended or duplicate shift created for testing.
- [x] Correct Premier League Hub Now 4K shorthand and today's saved guide/queue record; eighteen split/import/read-back tests pass, publication unchanged. Importer change awaits publishing.
- [x] Publish the private manual-credentials page so it opens at bmsupport.uk/manual-credentials, and add one clearly-labelled £0 demo manual customer (MANUAL-900001, login democust) so the page can be tried; live page serves the secure access form and profit totals are unaffected. Customer email receipt and login read-back still await the customer's own run.
- [x] Move User credentials from a dashboard tool card into the header beside Customers, for admin and management only; the card is removed so the page cannot appear twice, 13 access tests pass and build OK. Screen check remains blocked by the dashboard password/PIN. Preview only.
- [x] Keep manual customers separate from site accounts; admin grouping controls and manual-renewal name/account selection added. Ashley's live manual record reads calculated expiry 28 Aug 2027 from order date + 12 months; no live orders regrouped or subscriptions changed. Isolated grouping/renewal tests pass, preview build OK.
- [ ] Verify manual grouping and renewal creation save/read-back through the dashboard — blocked by account password/PIN; signed-in reads verified, no security bypass.
- [x] Remove the "Adjusted" tag from the admin Customers list; edited renewal dates and year joined display identically to recorded ones, corrections and "Use recorded date/year" restore options unchanged inside the edit pop-ups; 39 customer/date tests pass, typecheck clean, build OK. Screen check remains blocked by the dashboard password/PIN. Preview only.
- [x] Add independent package selection for each subscription login on multi-account customers; 32 customer tests pass, screen verification remains PIN-blocked.
- [x] Add admin-only customer-list username editing for No site account customers without creating accounts or changing credentials; 30 customer tests pass, build OK. Signed-in dashboard remains PIN-locked, so screen save/read-back is unverified. Preview only.
- [x] Hide expiry display and show No Renewal Yet for customers without a recorded joining year; preserve customers and saved dates. Seven date/year tests pass, build OK; screen verification remains blocked by dashboard PIN. Preview only.
- [x] Give multiple customer logins independently editable renewal dates and show Customers dates without times; 29 tests pass, build OK and signed-in read confirms separate dates for both multi-login customers. No real dates changed; screen save/read-back remains blocked by dashboard password/PIN below. Preview only.
- [x] Referrals from GJ or DaneJ never earn a referral bonus month; bonus box hidden and confirming refuses for those referrers, all other referrers unchanged. 26 customer tests pass; live read shows no bonus box on the Customers list; build OK, preview only.
- [x] Hide guest48hSite and danejSite test/admin accounts from the admin Customers list only; base customer data, referral rewards and credential/history tools unchanged. 25 customer tests pass and an authenticated read returns 22 customers with neither account shown; build OK, preview only.
- [x] Add admin-only last-renewed date editor and audited correction storage; restore recorded date supported, expiry/payments unchanged. All 27 customer tests pass; build OK. No real customer dates changed; preview only.
- [ ] Verify last-renewed date save/read-back on the Customers screen — signed-in browser reaches dashboard password/PIN lock; blocked by dashboard unlock.
- [x] Customer list: package names without quantities, credential logins beneath usernames, admin allocation for missing packages; 22 tests pass and authenticated read returns 24 customers with quantity-free names, saved login names retained. No real customer allocations or expiry changes made; build OK, preview only.
- [x] Replace first-subscription date display/editor with year-only entry and year-based customer tenure; eighteen tests pass, admin permissions and expiry unchanged. Dashboard screen check remains PIN-blocked; preview only.
- [x] Add customer years column and admin-only first-subscription date correction/backdating; fourteen database tests pass, including anniversary calculation, permissions, restoring recorded date and unchanged expiry. Screen verification blocked by dashboard password/PIN; preview UI awaits publishing.
- [x] Move pictured payment status, invoice PDF and subscription confirmation into admin secure checkout sidebar; signed-in completed renewal checked on screen, seven access/sync tests pass, build OK; actions and customer/chat/video behavior unchanged. Preview only.
- [x] Add dashboard Customers tab with recorded package, expiry, last renewal, first subscription and referrer; optional admin-only one-month reward for future completed new-customer 12-month purchases, once per sale, preserving remaining time. Seventeen database tests pass; signed-in read returns 24 customers, no passwords; build OK. Missing historical details shown as Not recorded; no live subscriptions changed; tab needs publishing.
- [ ] Verify Customers table, package allocation and reward confirmation through unlocked dashboard — blocked by required account password/PIN; authenticated customer read and isolated database allocation/reward tests verified, no lock bypass.
- [x] Snapshot referrer names on future referred new shop/manual sales; Orders shows attribution and staff secure checkout shows purchased items, customer details and adult choice. Thirteen rule/sync tests pass; real saved £115 order details verified signed-in on desktop/phone, build OK. No test orders created; display changes await publishing.
- [x] Repair completed £115 sale accounting: Square Invoice 45 confirmed paid, actual £4.61 fee saved; sale profit £80.39 and October profit £202.78 read back. Invoice reconciliation now repairs missing payment rows after paid_at; 15 tests pass, build OK. Screen verification remains blocked by dashboard unlock below; prevention changes preview only.
- [x] Correct renewal/new-customer selection for secure order summaries, setup and completion; three database tests pass. Existing renewal completion message corrected and verified in signed-in chat; database fix applies live without publishing.
- [x] Secure admin order steps refresh on order signals and every five seconds while visible; seven tests pass, build OK, signed-in response simulation verified unpaid→paid without reload or saved-order changes. Real customer transition not exercised; preview only.
- [x] Preserve actual sale-time fees; automatic checks fill missing transaction fees only. New sales read actual charges, reflecting provider fee changes without applying newer rates to past sales. Invoice sync preserves recorded fees. Live read-back awaits dashboard unlock below.
- [x] Admin dashboard Orders: recorded Provider fee and Net received columns beside original amount for admin/management; unknown fees stay Unknown, seven fee tests pass and preview builds successfully.
- [ ] Visually verify admin Orders fee columns — blocked by the dashboard password/PIN unlock; no credentials requested or security bypassed.
- [x] Show provider fees separately and deduct recorded fees from Profit & costs totals and package statistics; 13 calculation/invoice tests pass, unknown fees stay provisional.
- [ ] Verify provider-fee refresh and totals through unlocked Profit & costs — signed-in browser reaches the required dashboard unlock; awaiting user unlock. Actual £4.61 fee and October totals verified from saved records, not the locked screen.
- [x] Remove the QR code from the staff secure checkout panel (customer's own QR dialog unchanged); signed-in two-browser check shows the Accept/Decline banner with no QR wording or QR graphic, build OK.
- [x] Correct staff order notification links to exact secure checkout: future new/manual/paid staff alerts and existing stored links corrected, customer links unchanged; signed-in bell Open reached MANUAL-992894 secure page, five regression tests pass and build OK. Bell click fix needs publishing; future stored phone destinations corrected live.
- [x] Repair staff rotation notice: explicit customer screen-turn signals independent of correction angle; fresh presented frames dismiss after camera replacement, not stale pixels or errors. Two-party browser call verified notice stays over 15 seconds of black video and clears after picture returns without manual refresh; 12 tests pass. Physical phone remains unverified; preview only.
- [x] Remove seconds from login credential entry and displays across credential/profile/checkout screens; two precision tests pass and signed-in entry plus saved expiry display verified without changing credentials.
- [x] Subscription extended applies the sale term to saved credentials once, preserving remaining time; 18 tests pass and signed-in test renewal read back in Credentials (31 Jan → 28 Feb), fictional records removed.
- [x] Restore staff visibility of open tickets under All; real staff list verified and nine database permission tests pass; ticket chat and alerts untouched.
- [x] Replace customer inline Square/Stripe card forms with shared invoice payments and automatic status checks; authenticated checkout visually checked, both provider request flows tested with mocked responses, 15 tests pass; real provider creation/settlement remains unverified and changes need publishing.
- [x] Record #ba12297d paid per user's Square Invoice #42 confirmation; £65 payment row and paid_at read back, customer order shows payment confirmed; no replacement invoice or charge created. Logs did not establish the exact original expiry cause; replaced expiring-session UI and removed the local 24-hour invoice timer.
- [x] Stop home remount flicker on app return; signed-in browser checks preserve the same home heading through background/return and expired return shows only the lock screen; four lock-state tests pass, build OK; physical-phone check remains unverified
- [x] Make Knowledge Base full-width with two-column sidebar categories and a full-page customer-reading illustration; verified signed-in category selection, guide opening/back, intact header/rail and no horizontal overflow at 1920, 886 and 390px
- [x] Allow staff secure checkout viewing, customer chat and existing link sharing; verified staff link copying, chat send/read-back after reload, hidden completion controls and direct stage-change denials; 14 tests pass, temporary test order/chat removed
- [x] Add separate BM Support and Boro Fan Zone jobs boards with interview backgrounds, application forms, admin vacancy management and private application review; verified real admin vacancy save, anonymous application submission, admin read-back/status/notes, separate zone listings and mobile layout; 15 tests passed and fictional test records removed
- [x] Add Owner tools Staff page, employment dates, preserved former-staff directory and full-page office illustration; verified signed-in date save and directory read-back with a removed fictional record, plus mobile layout and rule tests
- [x] Staff Shift history: pick days from a calendar with Previous day / Next day / Today; admin Staff shifts restored to its day-range buttons — verified signed-in (day 9 shows Friday 9 October 2026, Previous day gives Thursday 8 October, Today returns to Monday 12 October)
- [x] Dim staff Shift history and Shifts with the same office picture; align admin/staff shift-end answers — nine tests passed and signed-in pages both show today's 19:00 sign-out answer
- [x] Check all-user notification visibility above the app lock screen; restore member/staff listeners, remove reply suppression, and verify a simulated incoming alert while signed in and locked
- [x] Add copy icons to revealed staff PINs on the admin and main Staff PIN pages; keep existing unlock requirements
- [x] Match admin PIN unlock background to Staff PIN and add all-staff PIN tab with individual hidden/reveal controls; background and access tests verified
- [ ] Verify staff PIN eye controls through the unlocked admin dashboard — blocked by required account password and staff PIN
- [x] Make Staff PIN and shift history illustrations full-page backgrounds and verify full-width shift history
- [x] Weekly fantasy squads: distinguish matchday absence from unused substitutes and label both directions of exchanges
- [x] Restore Boro matchday goal updates: reject FotMob zero event IDs, recover today's goal/bookings and verify thread read-back; permanent fix awaits publishing
- [x] Profit & costs Packages: tabs always ordered single 12, single 6, single 1 month, then Multi Room, then Triple Room
- [x] Refresh Profit & costs with a clearer background and right-sidebar pie-chart statistics; verify signed-in preview
- [x] Shift breakdown pie chart: show the staff username on its own line at the bottom of every card
- [x] Add separate staff shift pie-chart breakdown cards on profiles and admin staff shifts; verify actual worked hours and percentages
- [x] Away status: log every Away period so it appears in the staff shift reports and shift history
- [x] Working Status box: move the Away icon next to the sign-in and sign-out icons
- [x] Early finish requests: a reason is required before admin or management are asked to approve
- [x] Staff Away: all staff, fixed reasons, manual start/end and scheduled Outside Of Office Hours
- [x] Show the selected Away reason consistently on staff cards and Talk
- [x] Scottish Premier League Streams: add “Under Team Channels” on import and repair the saved fixtures
- [x] Add St Patrick’s Day pictures and effects to Talk and inbox on 17 March, UK time
- [x] Add St George’s Day and New Year’s Day pictures and effects to Talk and inbox on their UK event dates
- [x] Add Bonfire Night and Easter Sunday pictures and effects to Talk and inbox on their UK event dates
- [x] BM Support inbox: move its icon out of the side rail into the top header, directly before the mentions icon
- [x] Keep tall ticket headers scrollable on phones while preserving conversation space and the reply box
- [x] Restore ticket message scrolling on phones without changing messages, alerts or realtime behaviour
- [x] Create the narrated iPhone Purple Player Lite installation guide using the provider-supplied BM Secure Code, then example username and password
- [x] Create separate narrated BM Support App Store installation videos for Android TV and Amazon Fire TV
- [x] Member home: enlarge the welcome copy and let the subscription box fill the space beneath it, with no empty gap and no clipped text on phones
- [x] Revise continuous demo with actual sample user profile and security-gate screenshots using test data — delivered narrated v5
- [x] Re-capture the full narrated demo with selective masks only: preserve usernames, office times, feature text and images; conceal prices and sensitive personal/account values; delivered v4 (gate remains labelled illustrated overview)
- [x] Add secure checkout to the continuous narrated demo using actual checkout templates with sample orders; narrow checkout masking to prices and private values (other chapters retain previous footage)
- [x] Correct demo delivery: one continuous 7m30 narrated video with nine embedded labelled chapters and chapter descriptions, keeping privacy redactions
- [x] Sectioned privacy-safe app feature overview: nine described videos covering public joining, referral sign-up, illustrated security gate and principal app sections; action-by-action/member-session coverage limitations included with the downloads
- [x] Sports guides: preserve supplied @ matchups across all sports and formatted read-back
- [x] BM Support inbox: private messaging, unread rail badge, pub background, edit/delete and admin/management reports
- [x] Home loading: stop the Working Status name plate moving upward when shift details arrive
- [x] Customer name cards: give approved BM Support customers a person-icon default without replacing their chosen card
- [x] Staff nameplates: male/female role defaults selected from Edit profile without replacing custom choices
- [x] Sports imports: fix NFL spaced/SNF rows and NBA League Pass inline ET/UK rows permanently
- [x] NHL Center Ice: always use ET listing times and repair the incorrect current event
- [x] Knowledge Base: full-page articles, complete video playback, and ratings sidebar
- [x] Member home: move subscription details into the welcome panel and use a vertical sidebar advert
- [x] Boro Fan Zone adverts: include matching BM Support banners enabled for the Forum zone
- [x] Affiliate adverts: random fair rotation, size-based admin sections, and per-banner view/click totals
- [x] Sports Guide reader: use whole-page scrolling and show every event in one continuous list
- [x] New sports guides: make manual Add Blog saves use the same canonical event layout as imported guides
- [x] UFC imports: preserve repeated bold title → UK/ET time → own channels blocks permanently
- [x] Sports Guides: show newly created empty categories to staff while keeping them hidden from members
- [x] Make the complete BM Support and Fan Zone profile experience fit iPhone screens, including Credentials
- [x] Stop installed iPhone app launches from opening an advert
- [x] Sign-up: block VPNs for direct BM Support registration, bypass referral links, and leave Boro Fan Zone unaffected
- [x] Remove automatic support tickets from sales (code + existing order tickets)
- [x] Shop: duplicate How to Order tab as How to Renew with its own video upload
- [x] Secure checkout: browse completed/current stages backward and forward without undoing payment
- [x] Secure checkout: let staff complete a sale from confirmed account setup
- [x] Paid manual-order checkout: private install-guide card and order-password access
- [x] Secure checkout: keep paid Square details and continue control in the right sidebar
- [x] Secure checkout: prevent the manual-password screen flashing on hard refresh of member orders
- [x] Secure checkout: require staff to move a paid order into account setup before showing setup and QD details
- [x] Secure checkout: move paid account status and account sign-up into the right sidebar
- [x] New-sale completion: save username/password, subscription term and dates, then post them automatically in checkout chat
- [x] Secure checkout: show and optionally include an admin-managed QD app login code
- [x] Android shift alerts: route scheduled start/end warning kinds to their spoken audio channels
- [x] Install Guides: allow the app-download page to scroll on short desktop screens instead of clipping its content
- [x] Talk Channels: always open at the first message on narrow phones and short desktop screens instead of halfway down
- [x] Merged DAZN imports: parse inline fixture slots and title qualifiers without losing or corrupting events
- [x] Talk Channels: show “Away - From the office.” in the staff list when DND is active
- [x] Talk Channels: remove members from the room's online list immediately when they exit the channel
- [x] Talk Channels: make member nameplates fill the same full sidebar width as staff nameplates
- [x] Talk Channels: move the online numbers into the STAFF and MEMBERS tabs (desktop sidebar and mobile People sheet)
- [x] Display install-guide PDFs inside the page on mobile instead of triggering downloads
- [x] Make the BM Support Apps download page and download popup phone-friendly
- [x] Keep Talk Channel mini profiles centred and readable on mobile
- [x] Give Talk Channels separate mobile Staff and Members buttons with a phone-friendly member list
- [x] Fix mobile Referrals text overlap and make main and Fan Zone profiles phone-friendly
- [x] Make Talk Channels fit phone screens with reachable channel, people, message and composer controls
- [x] Admin dashboard: move Theme and Header links into Owner tools and restore Add manual order
- [x] Profit & costs: group crypto under NOWPayments and bank transfers under Wise
- [x] Talk Channels: replace the staff card with an always-visible Online/Offline staff list, name cards, working/break countdowns, and current channel
- [x] Asian Games import: verify exact post and preserve its heading, UK time, title, and both beIN channels
- [x] Manual sports-import split: prevent heading snap from deleting one half and preserve shared heading context
- [x] WST snooker imports: preserve repeated title → UK/ET time → channels blocks and add permanent format regression checks
- [x] Split Shop orders into counted workflow tabs: New order, Awaiting payment, Account setup, Completed, Cancelled
- [ ] Capture Gmail forwarding confirmations from every CloudMailin multipart format and show them on the Bank Transfer page
- [x] System Status completed incidents: organise cards into year and month tabs
- [x] Make System Status use the full available page width and move notification controls into a right sidebar
- [x] Rugby Pass numbered rows: retain explanatory text after the time without swallowing the row into the previous event
- [x] Sports imports: insert every explicit competition heading at the start of each imported event name
- [x] Fix Triller TV numbered, trailing-time imports and retain each Event N as channel `Triller TV N`
- [x] Separate completion messages for new account sales and renewals; remove incorrect “upgraded” wording
- [x] Remove the duplicate “setting up your account” notice and its button from order support tickets
- [x] Add the 300x250 advert slot on the members home page below the working status / subscription box
- [x] Widen the member channel sidebar for its 300x250 banner and silently refresh visible Adsterra creatives every minute
- [x] Adsterra live in all four advert sizes; AdSense remains disabled until account approval
- [x] Audit published sports guides for leaked lead/channel text and prevent public guide text leaks on future imports
- [x] Stan Sports imports: preserve complete event names through preview, save and read-back
- [x] Merged DAZN imports: keep preview and saved guide identical; prevent inherited channels and isolated marker corruption
- [x] MLB Extra Innings: repair draft from dated source; stop old rows carrying into new schedule
- [x] Guides: stop adding an extra hour to times
- [x] Setanta Sports + Flosports College imports
- [x] Investigate random sign-outs
- [x] Sports guide categories: sub categories step through in the sidebar (back + home icons), no pop-up
- [x] Install guides: Transfers + Get the BM Support Apps use Welcome layout, keep illustration
- [x] NFL Game Pass import: ignore the provider header and read channel, fixture and trailing time from each listing row
- [x] Sports imports: events without their own day or date always use today's UK date; never infer tomorrow from clock order
- [x] Telegram → Sports Guide importer: imported listings save as drafts and open directly in the guide editor for date entry
- [x] Greyhound import: retain a shared date embedded in a multi-sport heading and repair the affected draft
- [x] Wise incoming-transfer feed on the Bank Transfer page: live read of payments, auto-matching to pending orders, one-tap confirm
- [x] Download BM Support Apps: make the BM Support App Store tab first and default (verified in the signed-in preview)
- [x] Member sports guides: flag converted local times that fall on the next or previous day from UK time
- [x] Member sports guides: list every event channel beneath Available channels, including single-channel events
- [x] Staff home: align compact Working Status with the hero image, move the greeting beneath it, and show local current-shift time when different
- [x] Staff home: role pill beside the name, and a shift encouragement beneath the Working Status box
- [x] Staff home: restore the next shift in compact Working Status and change the message while signed out

## Done (recent)
- [x] UFC Streams multi-time imports: attach every listed channel to every time and retain next-day rollover
- [x] Cymru TV imports: parse channel-first fixtures with bracketed date and BST time
- [x] Sports imports: carry competition headings onto event names and prevent headings becoming event channels
- [x] Sports guide imports: use `v` as the event matchup separator; repair Scottish Cup and UEFA Nations League fixture names and verify future imports
- [x] Header clocks + office-hours dialog, live dates, England public holiday closures
- [x] Automated messages & emails admin section (Account setup / Sales / Support tickets / Emails), HTML-only email editor with secure image upload
- [x] Account Not Activated screen inside security gate only, with appeal
- [x] Store orders: buyer name beside price, details-on-demand, month/status tabs, no auto-tickets
- [x] Password+PIN gates: Discount Codes, Manage Products, Members & Role Management, Shop Orders
- Sports imports: NFL Sunday Ticket `NFL NN: ET | UK` rows import with the stated UK time and channel `NFL NN`.
- [x] Talk channels: unclaimed-tickets bar above the STAFF/MEMBERS pills (Talk only), collapsible, live Claim + Go to ticket; page-top banner stays elsewhere

## Manual order secure checkout pages
- [x] Draft checkout template designs for approval (Stripe/Square/Wise/Cash/Paid)
- [x] Manual order: email + discount fields, remove crypto
- [x] Staff home: hero image and greeting first with status box to the right; role and shift welcome under the name
- [x] Staff status: day and date shown before the shift time, on one line, for UK office and local time
- [x] Unique secure page per order, copy-link button, status bar
- [x] Stripe/Square invoices + pay buttons; Wise bank details + strict reference
- [x] Cash thank-you page; "we got your payment" state once paid
- [ ] Completed manual orders move into their sale type tab
- [x] Order form: New or Existing customer question
- [x] Completed state on secure page: "account set up" (new) / "subscription upgraded" (existing)
- [x] Unique password per secure page, shown next to link
- [x] Live chat bubble on secure page (customer <-> admin/management)
- [x] Audit and fix all remaining BM Support and Fan Zone screens for iPhone widths

- [x] Replace Stripe/Square customer receipts with paid BM Support PDF invoices and add Invoice Template Owner Tool
- [x] Staff status: shift times that fall on different days break onto separate lines
- [x] Sports guide: fewer card columns so both time zones stay visible
- [x] NBA League Pass imports: support `NBA NN: Fixture 12:00am Wed` weekday-clock rows (stated UK time, weekday pins the date)
- [x] Sports import: ET→UK conversion uses the import time (nowMs) instead of the real clock, so date-pinned tests stay stable

- [x] Stop the profile location line flashing between competing page labels.
- [x] Download BM Support Apps: add an iOS Purple Player card with an App Store QR code, App Information text "Login Code is Added", and a store link (frontend-only, no database row)

- [x] Default background for Talk + inbox on non-themed dates: digital illustration of a customer on the phone to a call centre worker (replaces pub picture)
- [x] Admin secure checkout page: same Shop picture as Orders, kept behind the panel so nothing is covered
- [x] Admin secure checkout page: chat becomes the customer's bottom-corner bubble, order details full width
- [x] Restore manual Break/Main break buttons on Working Status and Clock page; moderators included in break plan; Start now fallback for missed/no-slot breaks
- [x] Manual orders get their own staff alert ("Manual order — added by X for Y") instead of "New order — DaneJ placed an order"; Telegram hook flags manual orders too
- [x] Customer secure order page: remove the WhatsApp video button so in-site Video help is the only video option
- [x] Secure checkout: payment-confirmed wording says install the app using the install guides, with a Continue button into account setup
- [x] Secure checkout: customer "Your app login details" card revealed once account setup is confirmed; verified reveal on the test order, nothing shown on a wrong password, 7 tests pass
- [x] Account menu "Get the Android app" pop-up: bigger code with a proper white border, pure black modules, and the web address shown in text as a fallback; verified it decodes to https://bmsupport.uk/get-android-app
- [x] Secure order page: Video help button moved inside the install-guides card, directly under the Open install guides button (was below the card)
- [x] Order video help: staff offer always includes a video slot (customer camera reaches staff), call no longer restarts on each status poll, remote sound plays after Answer; verified with a two-browser test call
- [x] Order video help: offer/answer carry their network routes in one message, lost offers/answers are re-sent, failed connections retry; verified relay-only (mobile data style) test call
- [x] Staff video call: separate sound player + speaker button; picture turns when customer's phone is held sideways (auto-rotate off)

- [x] ESPN+ import: rejoin slot dates wrapped across lines so UCF v Houston stays separate; 157 events, signed-in queue check shows no errors

- [x] Staff calls connect without microphone permission; real two-browser order call verified with zero staff media requests, denied unmute keeps call alive, subsequent unmute works without restarting

- [x] Video help icon in the Working Status box beside the tickets icon; signed-in /home check shows both buttons and the claim box opens

- [x] Video help icon moved into the Talk channel header staff controls beside the tickets icon; side-panel copies removed; signed-in /home/welcome check shows camera icon at x=796 next to tickets at x=834
- [x] Video help icon tooltip with live counts (Waiting / In progress) in the Talk header and Working Status box; verified with a real test call.

- [x] Streaming device prices: rebuilt the missing refresh pages the daily/stock cron jobs call (they had been 404ing since early October); scraped prices and stock updated for the eight satellite-shop devices (Z Mini £109, A11 Gold £129, A11 Link £99 out of stock, KD3 £68.95); Amazon and Xiaomi pages hide prices from server readers so those rows keep their stored values; stock cron now sends the secret header.

- [x] Pay by bank (Stripe open banking) toggle on secure checkout Stripe method
- [ ] Demo test order showing secure checkout with Square + crypto only and auto-posted Square invoice link (screenshots)

## Combined Customers screen
- [x] Merge subscription details and member/role controls into one customer card list with one edit pencil; retain site/manual tabs and existing security gates. Six sorting tests pass; signed-in navigation has no page errors, card verification awaits password/PIN unlock.
- [x] Move Members & Role Management beneath Customers, repoint both header copies and preserve protected controls; old links redirect to Customers. Nineteen existing tests pass, build OK; signed-in header click reaches Customers with no page errors.
- [ ] Verify combined customer/member cards after unlocking — existing admin PIN and member password/PIN gates block the signed-in screen check; no security bypass used.

## Customer card grouping
- [x] Combine email, last IP, year joined and years as customer into one block under a strong divider on admin customer cards; signed-in card screenshot confirms all five grouped, no clipping. Preview only.
- [x] Group Subscription Expires with Last Renewed Subscription in one box on each customer account and rename both labels (also in sort choices, edit pop-up, Add order sidebar and Non-site credentials cards); signed-in card screenshot confirms the pairing and strong divider with no clipping, 8 customer tests pass, typecheck clean, build OK. Preview only.

## Referral bonus ticks
- [x] Remove acknowledgement-only ticks; buttons and ticks now require server-verified completed paid 12-month sales. Forty-five tests pass and build OK; unlocked-screen verification remains blocked below.
- [x] Move referral bonus control beside Referred by; completed awards show Referral Bonus added.
- [x] Record both existing non-excluded referrals without adding time; authenticated read confirms all expiry dates unchanged; 41 tests pass and build OK.
- [ ] Verify tick/button appearance and future award through unlocked Customers screen — blocked by account password/staff PIN; no security bypass or live bonus applied.
- [ ] GoCardless go-live: supported banks from GoCardless institutions by customer country; not-listed fallback Square card / internal bank details (blocked: account verification)

## Staff group video calls
- [x] Multiple staff on one secure-order video call, staff-only "on this call" box, request admin/management help button; any staff leaving never drops the call

## Ticket video calls
- [x] /video staff command posts QR; customer phone page; multi-staff room on tickets

## Customer new-order destination and reminder
- [x] Put customer status, purchased items and existing cancellation actions on shared order cards; remove customer sidebar duplication, retain admin pane. Both signed-in lists and real package quantities/prices verified; cancel confirmation dismissed without changing orders, eight password/notification tests pass, build OK.
- [x] Add owner-only order password requests on My Orders cards and notification copy actions; eight ownership/notification tests pass, build OK.
- [x] Signed-in My Orders card request sends a notification; its Copy chat password button populates the clipboard. No order or payment changed.
- [x] Require entered order passwords for all customer secure checkout access; signed-in/link-only and automatic password bypasses removed. Twelve password/access tests pass; signed-in page shows password entry.
- [x] Send placed orders to Shop orders; signed-in My Orders destination verified.
- [x] Persist a customer payment reminder with an owner-only secure password copy action; keep passwords out of push payloads.
- [x] Ten destination, notification and ownership regressions pass; preview build OK.
- [ ] Verify a newly placed sale's notification and clipboard action end-to-end — awaits a new customer order; no live sale created for testing.

## Customer Portal
- [x] Replace emailed login links with entered eight-digit codes and second-by-second countdown. Nine tests pass; selected customer signed-in and public code entry verified, countdown ticks and expiry removes content; database rejects after five wrong attempts. No real email sent; preview only.
- [x] Replace clipped tab-bar overlay with a fail-closed content gate; real customer first entry and every portal tab blocked, expiry removes content, other-user grants rejected, email button reachable at 950px and 390px. Seven tests pass; build OK. Email delivery/redemption not exercised in this repair.
- [x] Personal portal link per site customer, 24-hour one-use email login link, portal tabs (Shop, My Orders, My Logins with PIN, Install Guides), side rail single entry, admin copy/reset. Link sign-in and reuse rejection verified in preview.
- [ ] Manual customers without a site account — waiting on the user to decide whether to auto-create an account for them.
- [ ] Verify login-code email receipt — requires customer inbox; no real customer email sent in testing.

## Side icon rail ordering
- [x] Add admin-only Owner Tools editor for separate staff/user orders with existing persisted keys and shared rendering helpers; two ordering regressions pass, preview build OK.
- [ ] Verify editor save/reload through the UI — authenticated dashboard requires account password and staff PIN; no unlock bypass or shared order changed for testing.

## TV Remote Helper
- [x] Route request-box Open/Answer to the secure order Screen share tab or linked ticket screen. Signed-in Open on DEMO-TV1 reaches admin-secure-page with Screen share selected; 15 tests pass and build OK. Ticket destination regression passed; real ticket stream unverified. Preview only.
- [x] Preserve active TV host/viewer connections during staff portal lock. Signed-in browser verifies the same video stays mounted, no peers close and hidden/inert protection remains intact; 13 session tests pass, build OK. Saved browser regression added; JS runner lacks its browser binary, equivalent Python browser check passed. Physical TV relay continuity remains unverified; preview only.
- [x] Keep joins on shared order/ticket screen-share pages before mounting a generic session; existing hosts and viewers join the same scoped room. Move admin-only TV Remote overview and role-gated dashboard icons after Home, remove both rail/editor entries. Twenty-five tests pass; signed-in header and active legacy order-session redirect checked; build OK. Preview only; ticket TV stream and physical-TV picture remain unverified.
- [x] Remove redundant secure-order screen share link; customer controls reset from order status every two seconds and staff cannot reopen locally ended sessions from stale rows. Nine tests pass, staff tab and customer fresh-code entry checked in browser; build OK. Actual end/reconnect on a physical TV remains unverified and changes are preview-only.
- [ ] Confirm v1.2 helper works end-to-end on a real TV (code, Allow, Start, picture on staff TV Remote page). Waits on Dane J testing.
- [x] Add screen sharing to secure checkout and tickets following explicit approval; tickets retain their original entry conversation and use a separate share tab.
- [x] Place the Order and Screen share buttons beside the "Secure page" heading on the staff secure checkout page. Heading and buttons checked on the same row in browser; build OK. Preview only.

## TV remote control (Google/Android TV)
- [x] Helper v1.4 source: bundled BM Remote Control app installed via session installer; staff remote pad (D-pad, OK/Back/Home, type text, open app), controller-only rule. Blocked: rebuild/sign in Android Studio and test on a real Google TV.

## TV remote enabling program for computers (parked)
- [ ] Deferred by Dane J on 23 Oct 2026 — review in the future, do not build until he asks. Windows and Mac programs that switch Fire TV remote control on over the home Wi-Fi (the phone-app route shipped in Settings › TV remote already covers Android). Unsigned builds mean a first-run "Windows protected your PC" / macOS "Open Anyway" warning, with staff talking customers through it; a Mac Terminal one-liner is the warning-free alternative. Both would need download buttons in Settings › TV remote and a build on a Windows PC and a Mac, since they cannot be produced or signed here.
