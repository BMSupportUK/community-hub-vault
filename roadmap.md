# Roadmap
- [x] Secure selected order, discount, player-settings and staff push gates; signed-in owner storage forgery, private-key reads, grant forgery and unauthorized push requests rejected; ten tests pass. Real password/PIN unlock and legitimate push delivery remain unverified.
- [x] Secure dashboard, global screen lock and customer portal reads against forged browser unlocks; session-bound grants and direct-data/server checks installed. Real portal-code and dashboard recovery-code flows verified; forged grants, storage/broadcast unlocks and expired profile/order reads blocked; notifications remain readable. One-hour portal limit confirmed. Password/PIN/TOTP completion and an active physical screen share remain unverified; existing peer keep-alive code retained. 1636 tests pass, 27 focused checks pass, preview build OK; publish required for live UI.
- [x] Movie posters open a full details page on Android/Fire TV/phone and shared Windows/Mac, with description, Play/Resume, favourite, vote and Back to posters; no movie play pop-up. Installer releases and physical-player verification not included.
- [x] Released Windows 0.4.129 with the full-screen stop-start fix (the picture is never squeezed to nothing while moving from preview to full screen). Installer size matches the compiler's total, 7-Zip test passes 807 files, and the live download's SHA-256 matches the built file. The build script now stages device-lock.cjs, which the main process needs. Physical Windows full-screen check still owed by the user.
- [x] Add persistent unlink-only lock and local saved-data wipe across Android/Fire TV/phone and shared Windows/Mac: 450 Android and 221 desktop tests pass; simulated desktop unlink/restart shows only the message. Website orders/shared data untouched. Not released or physically tested.
- [x] Released Windows 0.4.127 and universal ad-hoc signed Mac 0.1.127 with new provider categories at the top; 208 desktop tests pass, packaged rule/version checks pass, and both public downloads match checked files. Physical-device playback and Apple-native signature verification remain unavailable on Linux.
- [x] Repair today's published MotoGP guide from the original post: four correctly timed sessions with separate broadcaster lists; parser and saved read-back verified.
- [x] Reviewed twelve saved security findings: five hardened, seven dismissed after verifying existing protection/public reference data; fourteen focused security tests pass. Real signed-in reads return 33 member-role rows, 34 profiles and three staff records.
- [ ] Confirm member/staff page rendering after two-factor authentication; restored owner session stops at the two-factor challenge, which must not be bypassed.
- [ ] Review the new deep security scan when its background result arrives; the quick scan still raises additional policy flags outside the twelve saved findings.
- [x] Published shared VPN purchase fixes: live device quote and buy succeed, signed-out live payment page displays £25.30 through 7 December 2027 and Square card fields on desktop/phone. Eight website and twelve desktop checks pass. Existing Windows 0.4.115, Mac 0.1.116 and box/phone 6.11 use these endpoints without rebuilding.
- [ ] Verify a real paid VPN purchase and native screens on physical Windows/Mac/box/phone devices; no connected devices/payment credentials available. Android focused test could not run because Java is absent.

- [x] Paid VPN setup fixes the provider expiry before use; failed expiry disables the new account, and TV renewal never extends paid VPN. Sixteen focused checks pass; website publication and real paid provisioning remain unverified.

- [x] Correct Get VPN rejecting a saved expiry via a server-only metadata read; separate VPN purchase still ends with TV. Regression checks cover 7 December 2027 and private access. Website publication and real Windows scan/payment remain unverified.

- [x] VPN bought only inside BM Player (box 6.11, Windows 0.4.113, Mac 0.1.114); shop/renewal VPN removed; Profit › VPN tab at $1.99≈£1.57 cost. A real paid purchase not yet tried on a device.

- [ ] Build secure desktop VPN with an embedded WireGuard userspace tunnel, private streaming proxy, connection verification and server controls; release Windows and universal Mac only after tunnel/build/security checks. User confirmed BM Player-only protection.

- [x] Released permanent-BM-key box 5.90 (401); live APK matches built hash, 398 app tests pass. Added current server traffic under Live connections VPN pills; website publication requested for this release.
- [x] Build all current shared desktop changes; Windows and Mac staging succeeds and 189 desktop tests pass. Native VPN release remains blocked below; no pretend controls shipped.

- [x] Live traffic numbers/comparison bars and lowest-first server selection in Settings and both playback engines ship in 5.90; app tests and nine server-selection checks pass. Physical-player verification unavailable.

- [x] Retrieve live VPNresellers raw server figures, remove unverified byte/percentage labels and treat missing readings as unknown; eight selection tests pass.
- [x] User accepted the live VPNresellers API readings; no separate status-page comparison needed.
- [x] Build, permanent-BM-key sign and release box 5.89 (400) with the in-player VPN location control; 396 app tests pass.
- [ ] Complete and release Windows/Mac native VPN: shared secure coordinator and gated IPC prepared, but privileged Windows service and Mac native tunnel/signing setup are not available or verified here; existing desktop downloads remain unchanged.

- [x] Add a VPN location icon to both Android/Fire TV playback engines with an in-player server list and best-server choice; no channel navigation or playback release.
- [ ] Verify VPN location switching on a physical linked player; no physical phone or box is connected. Box 5.90 is released.

- [x] Theme improvements: lighter middle shading, see-through tiles, scene-at-top 1920x1080 pictures, Light/Medium/Strong shading setting, theme-colour selected outline (Android, Windows, Mac). Tests pass, box app compiles.
- [x] Released box 5.72, Windows 0.4.107 and Mac 0.1.108 with theme improvements; website publish scheduled.

- [x] Home-screen themes: 12 outside-stadium football, Kids cartoon, Fairy tale magic and 6 seasonal; website Themes section (switch off/delete), Android Settings › Theme, Windows/Mac Settings › Theme; 178 desktop checks pass.
- [x] Theme build/release task was already superseded by box 5.72, Windows 0.4.107 and Mac 0.1.108; current downloads are newer.

- [x] Desktop Movies opens Cinema and Series opens Recommended, fetching community ratings only for displayed posters; 182 desktop checks pass and both releases include the changes. Full startup playlist refresh is retained.

- [x] Released Windows 0.4.105 and universal, ad-hoc signed Mac 0.1.106 with channel logos and all pending shared updates; uploaded before switching current downloads. Public files match local SHA-256 checksums. Native playback still requires a physical Windows/Mac check.

- [x] Restore provider channel logos in the shared Windows/Mac guide, multi-screen picker and voice results; browser checks confirm logos and failed-image fallbacks, and 21 desktop checks pass. Installers are not rebuilt or published; real-provider desktop verification requires a linked Windows/Mac app.

- [x] Close refresh bypass of pending website 2FA; signed-in browser stays at the code screen after protected-page entry and reload; server functions reject pending verification. Valid-code completion still requires the user's authenticator.

- [x] Released all three apps: Android 5.56 (367), Windows 0.4.102, Mac 0.1.105; each built, obfuscated/packaged, signed, uploaded and switched to current in app_builds. Download endpoints report the new versions.
- [x] Publish the website so the exact rating rules and Details connection history go live; publish scheduled 15 Nov 2026, site responds 200 at https://bmsupport.uk.

- [x] Align website ratings with the box's exact two-minute ping/stall/reconnect/delivery snapshot; prepare atomic playback-bound player reporting. 15 website tests and six Android ChannelLink tests pass; website build OK.
- [x] Requested website publication for the exact rating rules on 15 Nov 2026; deployment completion is not yet confirmed.
- [ ] Verify exact ratings end-to-end on the box; no physical box is connected, and exact snapshots require a new public BM Player build (not requested). Older apps show awaiting box rating rather than an invented Excellent rating.

- [x] Move full-screen history into Details, retaining five-per-page UK-day records; record the current full-screen start without waiting for metrics and exclude previews. 22 focused tests pass.
- [ ] Verify populated Details on the signed-in customer screen; existing account security gate prevents access, and a physical player is unavailable for new-start verification.

- [x] Improve Android broadband test with longer measured transfers, setup-time exclusion and visible phase progress; 356 Android tests pass. Stream traffic remains separate from broadband capacity.
- [ ] Build/release the improved broadband test with buffering notices; verify measured speeds on a physical box (no connected box available).

- [x] Add five-minute reported playback reliability from current-session stalls/reconnects, separate from throughput; 20 tests pass and website build OK. Batched device reports mean this is not an instantaneous signal meter.
- [ ] Publish playback reliability and verify populated customer screen; existing password/PIN gate blocks browser verification.

- [x] Restore full-screen libVLC buffering notices for silent stalls and keep reconnect notices visible; remove misleading broadband-strength ratings from stream throughput. Android suite and 15 website checks pass; website build OK.
- [ ] Release the buffering-notice Android update and publish neutral stream-download labels; real-TV notice verification is blocked by no connected physical box.

- [x] Correct Android live-stream recovery for silent offline stalls and guide/Multi-screen retries; included in public 5.51.
- [x] Built and publicly released permanent-BM-signed Android 5.51 (362); 353 tests pass. Live updater and first TV-install choice report 5.51; public installer is byte-identical, SHA-256 be008525f409f0a533813a794bcf32201f8adfaa7e8b0d5f70a7ed62c458547e. Crash mapping retained privately.
- [ ] Verify recovery on a real offline stream on a TV; blocked by no connected physical box.

- [x] Remove the duplicate customer Connection information tab; show latest reported stream throughput with realtime updates, stale/preview guards and no unproven internet-blame labels.
- [ ] Verify populated latest connection readings on the customer page; signed-in browser remains at the existing password/PIN gate, and new reports require website publication.

- [x] Built and publicly released permanent-BM-signed Android 5.50 (361); 350 tests pass. Live updater and first TV-install choice report 5.50; public installer matches SHA-256 c949d4ad697d670380fd87ca4ace52a55eb55821c27f71b9feed5c44e764cf63. Physical-box verification remains unavailable.

- [x] Add to Android 5.50: remove All from Live TV and Multi-screen categories; default home entry to UK | Free to air while preserving playback return category; replace TV category drawer Close buttons with Press Left on remote to close; all 350 Android tests pass. Publicly released; physical-box check unavailable.

- [x] Prepare Android 5.50: clear pill beside Favourites heading, confirmed Live TV/Movies/Series multi-section clearing, equal-height Settings cards, uncommon options last, plain-language User agent explanation; all 350 Android tests pass. Publicly released.
- [ ] Visually check 5.50 favourites selection and Settings on a physical player; blocked by no connected device.

- [x] Correct Darts colon-separated dual-clock imports: actual post retains 12:55/18:55 GMT, both session names and PDC Event 1 through save/merge read-back; 154 sports tests pass. Website publication remains needed. Live review check was interrupted when the queued post disappeared during testing; no existing guides were changed.

- [x] Refresh the Installer codes page with the existing digital TV-install illustration, clearer form sections, selected-app states and mobile-safe controls; retain all issuance and security behaviour.

- [x] Generate a secure, copyable Downloader link alongside admin-issued Direct Install PINs and website codes; bind its 24-hour capability to the exact issue and retire it on completion.

- [x] Restore member-home stream information immediately beneath Subscription Details, using owner/profile-scoped live devices and showing title, category, device, player, elapsed playback and measured stream connection.

- [x] Built, BM-signed and publicly released Android 5.45 (356) with both warning corrections; 339 Android tests and ten timer/watchdog checks pass. Public updater reports 5.45 and installer matches SHA-256 18481c5641997be7421aeaaadd75c04d441330a17a89781dc0fe191c6f64a3b8. Crash mapping retained privately.
- [x] Traced automatic crashes to next-open delivery using the device's linked website owner (not an active provider login); reproduced detached warning exit failure and fixed both exit and destroyed-owner cleanup with explicit dialog ownership. Included in public 5.45.
- [x] Correct Android's unanswered inactivity exit with an independent shutdown deadline; ten timer/watchdog checks pass, including blocked screen shutdown and cancelling on Continue viewing.
- [x] Built, BM-signed and publicly released Android 5.44 (355) with the inactivity fix; 337 Android tests and ten timer/watchdog checks pass. Public updater reports 5.44; installer matches SHA-256 5cd0be286410074e4e9c063b63e8be2fe6d83582c2cc8448526b52adc44ae436. Crash mapping retained privately.
- [ ] Verify the unanswered warning closes on a physical TV box; blocked by no connected box.

- [x] Built and publicly released BM-signed Android 5.36 (347) with pending preview layering, search entry and proper on-request speed-test fixes; 326 tests pass. Public updater reports 5.36; public download matches SHA-256 21a9b9824a83b86be20aeb8b701e35087971b87af88d1678d0f2a7cfda15c187. Real-box playback and Fire TV microphone dictation remain unverified because no box is connected.

- [x] Fire TV voice entry bypasses Amazon speech activities and clears keyboard-blocking flags after the search dialog opens; 16 focused Android tests pass. No new installer released.
- [ ] Verify microphone dictation stays inside BM Player on Fire TV; blocked by no connected physical Fire TV. Keyboard focus alone does not prove Amazon remote dictation works.

- [x] Correct guide categories/preview stacking without stopping or reattaching its stream; both VlcStage interaction tests pass. Installer rebuild/release is not included in this fix.

- [x] Built and retained BM-signed Android 5.35 (346) with genuine on-request download/upload reporting; all 323 tests pass. Signer matches permanent BM key; installer SHA-256 7472744819e86cb5d3e6d2e67e55ed87850eb7424fa177a1939803b76a568ece. Public download unchanged.

- [x] Replace Live connections traffic estimates with on-request bounded adaptive broadband tests on Android/shared Windows-Mac; preserve actual timestamps and separate stream TCP connection time. Old speeds hidden until genuine tests arrive.
- [x] Prepare Android 5.35 and desktop 0.4.102/0.1.105 code; Android release compiles, all 323 Android tests and desktop regressions pass. Real Cloudflare transfers completed from sandbox (not customer's broadband); no public downloads switched.
- [ ] Verify genuine speed readings on a signed-in physical player; blocked by no connected player. Android fixes released in 5.36; desktop 0.4.102/0.1.105 public release remains outside this Android release request.

- [x] Add current BM Player title/category to customer subscription cards with a shared 15-second refresh, excluding previews and matching each subscription's credential.

- [x] Separate customer charts and IP/location rows into Viewing stats, alongside a Connection information tab containing playback logs; seven daily tabs remain within Viewing stats.

- [x] Stop preview writes/updates in the live connection-history trigger; full-screen transitions remain logged. Three regression checks pass, build OK; database currently has no preview-only history to remove. Real-device transition verification remains unavailable.

- [x] Added seven-day UK customer viewing stats below the customer-card connection log: daily doughnut summaries by watched title, Details tabs, current playback and IP/location/VPN rows. Separate admin-only daily records split midnight credits and expire hourly after seven UK days; existing lifetime totals and 30-day logs unchanged. Ten regression tests pass; preview build OK. Recording starts as the website update is published; old per-session totals cannot accurately reconstruct past daily records.
- [ ] Verify populated customer statistics through the signed-in screen; blocked by existing profile/password/PIN gates and no new daily records before website publication.

- [x] Released Windows 0.4.99 and universal Mac 0.1.102 with protected catch-up skip code; 171 desktop tests pass. Public metadata and byte-identical downloads verified: Windows SHA-256 6d57c6152ac760a9b675d4f52b76fea67df66dc7e1e21af2ef8a2b5325ea8164; Mac SHA-256 871a99b2941d1b23a23fd42f2959c879e1b09af53b46a296b188e1b08d0e2bf4. Mac ad-hoc signing completed; native Apple validation and real playback unavailable in Linux.

- [x] Added shared Windows/Mac catch-up two-minute forward skip, one-minute corrections and encrypted login/channel start memory; 171 desktop tests pass, including actual main-process command execution. Public downloads unchanged.
- [ ] Verify Windows/Mac catch-up against real recordings; blocked by no running authenticated desktop player in this sandbox.

- [x] Built and publicly released permanent-BM-signed 5.29 (340): live preview stays on the same attached surface, expanding beneath transparent full-screen controls instead of detaching and reattaching. All 315 Android tests pass. Live updater reports 5.29; public installer matches SHA-256 41072f33c012eb649df0470c0337181e8a741740d2925fc8be9edbf3a397587a.
- [ ] Real-box verification of 5.29 picture continuity; blocked by no connected TV.

- [x] Built and publicly released permanent-BM-signed 5.28 (339) with same-stream libVLC preview/full-screen handover and return to the guide; 314 Android tests pass. Live updater reports 5.28; public installer matches SHA-256 82663499086452c69748d6f26730846f9bd02caeb28aa1dc28971f18cd6fb183.
- [ ] Real-box check of 5.28 same-stream handover; blocked by no connected TV.

- [x] Built and publicly released permanent-BM-signed 5.27 (338): two-screen Multi-room stacked vertically with Up/Down remote navigation; Triple Room layout and audio preserved. All 312 Android tests pass; bmsupport.uk updater reports 5.27 and public APK matches SHA-256 4ee6a244ff0e448d22ec1baf410667c7f8d2f3285772e5648b29c9b21e652143.
- [ ] Real-box check of stacked Multi-room playback; blocked by no connected TV box.

- [x] Built and retained permanent-BM-signed 5.26 (337) with Triple Room's large picture above two smaller pictures; two-screen layout and highlighted-pane sound unchanged. All 311 Android tests pass. Not publicly released.
- [ ] Real-box playback check of the new Triple Room layout; blocked by no connected TV box.

- [x] Published 5.17 as the public download: home buttons restored; Favourites/Recently watched tabs show items as side-by-side cards. Updater reports 5.17; download SHA-256 990dd9b8 matches the tested signed build (versionCode 328).
- [x] Published 5.18 as the public download: Favourites/Recently watched cards now show posters (Movies/Series) and provider channel logos (Live TV). Updater serves 5.18; download SHA-256 36a8906c matches the tested signed build.
- [ ] Real-box check of 5.18 card pictures; blocked by no connected device.
- [x] Built signed 5.19: libVLC engines no longer attach the sound equalizer when the booster is Off, so Live TV/preview/Multi-screen keep the box's louder hardware audio path. Tests pass; retained asset, not yet public.

- [x] Built and BM-signed 5.16 (327): Favourites and Recently watched are now compact homeCard tiles sitting side by side in their own row under the main tiles; Sports guide/Settings/Multi-screen stay as small buttons. 305 Android tests pass (incl. new savedCardsSitSideBySide); APK retained as an asset. Not yet public.
- [x] Published 5.16 as the public download (updater reports 5.16; download byte-identical to the tested signed build). Real-box check of the two cards still blocked by no connected device.

- [x] Published retained BM-signed 5.11 APK before switching the current public build; live updater reports 5.11 (322) and downloaded file matches SHA-256 be54de6a729db20f3e9257952399f8ccc9daa7452e36decf6868ca510d5c624a. Signing certificate matches public 5.10.
- [x] Prepared BM-signed 5.11 (322): film/episode completion survives replay and restart, attached progress indicators refresh immediately, external-player results enter sync, and upload acknowledgments preserve newer writes; 300 Android tests pass and APK retained. Now publicly released.
- [ ] Verify 5.11 watched-item return/replay on a real TV; blocked by no connected device.

- [x] Released BM Player 5.09 publicly: rebuilt signed APK (versionCode 320, permanent BM signature), uploaded to app-builds first, then switched the current build row. Public updater reports 5.09 and the download is byte-identical to the built APK.
- [ ] Real-box check of 5.09 Left-steps-back on future programmes; blocked by no connected device.

- [x] Released BM Player 5.08 publicly: uploaded signed APK first, then switched current build. Public updater reports 5.08; downloaded APK is byte-identical to the tested build, versionCode 319 and permanent BM signature verified. User will check EPG return and Catch up on real TV.

- [x] Added Catch up to supported Live TV channels' play pop-ups, opening the existing archive and returning to the chosen category; rebuilt BM-signed 5.08 with 295 passing tests and retained its updated APK. Now publicly released; real-box playback check blocked by no connected device.

- [x] Built and BM-signed 5.08 (319): closing Live TV categories restores previous EPG row/time/scroll and focus; selecting the same category preserves position; box Category pill is display-only. All 293 Android tests pass; APK retained and now publicly released with Catch up menu addition.
- [ ] Real-box check of 5.08 category closing and display-only label; blocked by no connected device.

- [x] Built, signed and publicly released 5.07 (versionCode 318): Live TV left-edge Categories tab removed; bold "Press Left on your remote to list the categories" hint beside the box Category pill; phones keep the Categories pill in the View EPG bar. All Android tests pass; public updater serves 5.07 and the download matches the signed APK.
- [ ] Real-box check of the 5.07 guide layout (hint beside Category pill, no edge tab); blocked by no connected device.

- [x] Made 5.05 the public BM Player download: uploaded first, switched current build, public updater returns 5.05 and downloaded APK SHA-256 matches versionCode 316; 285 tests with zero failures/errors.
- [x] Built permanent-BM-signed 5.06 (317), retained APK asset: compact play menu, parental control first in Settings with in-app PIN pad, category row actions preserve the chosen identity; canceling PIN replacement preserves protection. All 288 Android tests pass.
- [x] Released 5.06 publicly: updater returns 5.06, public APK matches the tested build SHA-256, permanent BM signer and versionCode 317 verified; 288 tests pass.
- [ ] Install and verify 5.06 pop-up, PIN and category controls on the Amazon box; blocked by no connected box (ADB device list empty).

- [x] Website Direct Install blocks future step buttons and Next until active-run confirmation; completed steps stay accessible. Seven navigation/PIN tests pass; website build OK.
- [ ] Full signed-in Direct Install navigation check: initial future-step disabled state observed, but account/profile changes interrupted subsequent browser navigation; complete flow remains unverified.

- [x] Android 5.05 startup waits for the update check; Update now blocks playlists through download/install, Later/no update/offline check permits refresh. All 285 tests pass and permanent BM signed build retained; publicly released.
- [ ] Real-box verification of 5.05 startup update/install order; blocked by no connected device.

- [x] Android tester feedback built as 5.04: visible Live categories tab, long Back for current preview, hide/show category navigation (All/search keep content), clearer buffers/settings, optional configured external players with BM Player first.
- [x] All 284 Android tests pass; release builds and permanent BM signer verified; APK retained as an asset.
- [x] Released 5.04 publicly on request: uploaded to app-builds first, then made current; bmsupport.uk public updater reports 5.04 and downloaded APK hash/signature match the tested build.
- [ ] Verify 5.04 remote holds, installed external-player launch and playback on a real box; blocked by no connected device; user will install and test.

- [x] Released signed 4.85 publicly: bmsupport.uk updater reports 4.85; live APK SHA-256 matches tested build and permanent signer verified.
- [ ] Confirm GJ installed/runs 4.85 and test Movie Premiere there; no device attached, GJ still last reported 4.78 at 21:22 UTC with no post-release reports. Tester must update and play Movie Premiere; the newly allocated Virgin Media box belongs to danej, not gj.

- [x] Diagnosed an endless seek-on-frozen-decoder recovery loop (10 Movie Premiere freezes/minute, BBC no reports); built signed 4.85 with Movie Premiere clean-keyframe startup, same-feed fresh decoder/surface retries then in-app backup. All 256 Android tests pass, including the stage recovery flow; permanent signer matches public 4.84. 50Hz unchanged; public release verified.
- [ ] Verify Movie Premiere on Virgin Media with 4.85; blocked by updated real-box access. Upstream feed/ISP cause remains unproven because no raw stream or decoder errors are available.

- [x] Released signed BM Player 4.84 through the public updater: live info returns 4.84, downloaded APK is byte-identical to the tested build and permanent BM signer verified (versionCode 295).
- [ ] Confirm GJ installed and ran 4.84; blocked by no connected box and no new check-in (last reported 4.78 at 21:22 UTC on 13 Nov). Tester must use Settings › Update app and reopen BM Player.

- [x] Built signed Android/Fire TV 4.84: Films and Series use sliding category drawers, Left opens from any poster row's left edge while normal across-row navigation remains, phones have a left-side Categories control, and OK/tap selects and returns to posters. All 252 Android tests pass. APK saved without switching public update; real-box testing unavailable (no connected device).

- [x] Built signed Android/Fire TV 4.83 with pane-local Multi-screen black-picture recovery: fresh decoder/surface after 10s black or 4s frozen while READY, maximum three restarts, channel/audio preserved, stale callbacks rejected. All 250 Android tests pass including pane replacement; APK saved without switching the public update. Real-box playback unverified: no connected device.

- [x] Built and released Android/Fire TV 4.82: Left opens categories from any Live TV guide row/time without scrolling to the header; 244 tests pass, permanent signer verified and live APK byte-identical. Real-box interaction unverified: no connected device.

- [x] Released Android/Fire TV 4.71: removed full-screen rate measurement and switching, disabled Media3 surface rate requests; startup confirmation unchanged. All 14 targeted tests pass, permanent signer and exact live APK verified; real-TV playback unverified (no connected box).

- [x] Release Android/Fire TV 4.70: keep 50Hz OK button inside TV-safe bounds with scrollable message and density-correct button sizing; 13 existing tests pass, permanent signer and live APK verified. Real-TV visual check remains unverified.

- [x] Release Android/Fire TV 4.69: picture with OK confirmation explaining smoother 50Hz playback and a few seconds of black screen; switch only after OK, then immediately enter linked-device check without a second warning. All 13 tests pass; permanent signer and exact live download verified. Real-TV visual check remains unverified.

- [x] Release Android/Fire TV 4.68: opening video first, then visible 50Hz switch, then device-link screen; 13 display/startup tests pass, permanent signer and exact live APK verified. Real-TV picture/switch check remains unverified.

- [x] Correct all four BM Player PDF guides: remove account-number entry and clarify choosing the app login during device linking. Regenerated and uploaded all four private PDFs; authenticated read-back matches exactly and public access is blocked. All 15 pages visually inspected: existing sparse install pages remain unchanged, no clipping or overlap. Five guide checks pass and build OK. Full card-opening recheck blocked by profile selection; hidden legacy article bodies remain front-page-locked and are not rendered for these guides.

- [x] Fix zero-value manual-order notifications using the finished transaction total; live deferred trigger verified, Matty Brown alert repaired to £60.00 and Alex Shimmin to £65.00, saved amounts read back, six regression tests pass and build OK. Dashboard visual check not performed; no real orders created during testing.

- [x] Correct manual-order customer labels (Orders and Profit & costs) and remove order creation from the customer-card email dialog; verified MANUAL-595281's saved customer is Alex Shimmin, six tests pass and build OK. Full dashboard check blocked by password/staff PIN; website changes need publishing.

- [x] Fix manual-customer checkout email errors and exclude paid orders from the email picker; reproduced missing email-column error for MANUAL-595281, live RPC now prepares successfully, 13 tests pass and build OK. Actual button/send check blocked by dashboard password/staff PIN; no email sent during testing.

- [x] Add optional existing-customer expiry to manual customer creation and show it on the customer card; five tests pass, expiry storage/list verified and build OK. Full signed-in form check blocked by profile/password/staff PIN gates; publishing needed.

- [x] Add manual customers without creating accounts; save email and provide an explicit customer-card secure-checkout email action. Account creation remains at checkout completion; five tests pass and build OK. Signed-in end-to-end email check blocked by dashboard password/staff PIN; publishing needed.

- [x] Give each Multiple accounts login its own card, expanding after customer sorting to keep owners adjacent; preserve original customer/account editing and other tabs. Six checks pass and build OK. Full dashboard visual check blocked by password/staff PIN gate; publishing needed.

- [x] Match Knowledge Base player PDF opening to Install Guides: modal over unchanged cards, desktop toolbar-hidden PDF and mobile scrolling pages. All four signed-in desktop opens, mobile pages and return to cards verified; five guide checks pass. Website changes need publishing.

- [x] Create four illustrated multi-page BM Player PDFs in private storage and open them in a paged reader without download controls; front-page cards preserved. All four signed-in opens/page turns and blocked public PDF access verified; 10 tests pass. Visual PDF QA reduced sparse pages and enlarged text; final pages show no clipping or overlaps. Website changes need publishing.

- [x] Preserve and lock the screenshot's Knowledge Base front page and four guides; signed-in desktop, guide opening, search and rejected article/category edits verified; four regression checks pass. Frontend changes need publishing. Mobile inspection showed existing portal header overflow, outside this request.

- [x] Re-restored Peacock Rinkside and UFC press-conference channels lost again before the cleanup fix went live; DAZN Thursday channels unknown (need user).
- [x] Restore UFC's missing channel and finish; fixed shared End-row cleanup, verified signed-in read-back and 11 tests (cleanup fix needs publishing).

- [x] Restore Peacock's missing Rinkside channel and end time from the original post; verified signed-in guide read-back and regression tests.

- [x] ATP Tour card showed stale "Wednesday, 23rd September · 09:00 BST" summary — fixed stored excerpt; manual guide saves now refresh auto summaries from the first listing (needs publish)
- [x] Built signed 4.86: first player keeps late VIP Cinema/Movie Premiere frames instead of freezing for a keyframe; 260 tests pass. Not yet released.

- [x] Published BM Player 5.19 (versionCode 330): sound booster Off now detaches the equalizer so Live TV, guide preview and Multi-screen use the box full-volume path. Upload verified byte-identical to the signed tested build; public updater reports 5.19. Real-box volume check pending.
- [x] Built and retained signed BM Player 5.20 (331): whole uncropped provider posters in Favourites and Recently watched; home buttons and channel logos unchanged. 304 tests passed; BM signature verified. Not public; real-box appearance unverified.
- [x] Fixed adult history privacy in unreleased 5.20: provider category IDs resolved once per list, shared reads/writes exclude adult and unknown-category items and purge older history; adult name checks added. All 305 tests pass including save/purge regression. Signed installer rebuilt and retained; not public and real-box check unavailable.
- [x] Rebuilt retained signed 5.20 with direct live gain (no equalizer's -12 dB attenuation), decoded PCM movie/series audio for loudness effects, accurate dB labels and preserved Multi-screen mute. All 307 tests pass; BM signer verified. Not public; listening check blocked by no connected box. Movie/series Dolby passthrough now disabled for boost-compatible PCM output.
- [x] Published BM Player 5.20 (331): uploaded verified retained signed installer before switching current build; bmsupport.uk updater returns 5.20 and public APK is byte-identical (SHA-256 ec596096162c101f7f2c0896155ee052dc1c3a697519d580ca8b84758f009530), internal version 331/5.20 verified. Real-box install/listening check unavailable.
- [x] Published BM Player 5.30 (341): catch-up Skip to listed start and one-minute skips stop the old recording cleanly and ignore its late finished signals, ending the pull-back loop. Public updater reports 5.30; installer byte-identical to the signed build (SHA-256 6581fd795fe07a15da75aab508e82c7f93fa2f4bd4605ddf9f8060463cb7917c). Real-box skip check unavailable.
- [x] BM Player 5.31: catch-up skip moves forward (Skip ahead 2 min) and remembers each channel's real start; public
- [x] Viewing stats: connection strength bars, buffering count and slow-internet/channel diagnosis (website)
- [ ] Android 5.33 sends measured speed (code done, APK build pending — sandbox build tools wiped)
- [ ] Windows/Mac send measured speed (not started)
- [x] 5.46: dropped Live TV channels auto-reconnect for up to 2 minutes (published)
- [x] Published BM Player 5.52 (363): improved broadband speed test (longer measurements, clearer progress) so Settings shows a real broadband figure; buffering notices restored on the live player. 356 tests pass; public APK byte-identical to signed build (SHA-256 acfbc43fac2db3d5b20549be40ec75b0a09fb79b57078a319d4c97993283d3c0). Real-box speed-test check unavailable.

- [x] VPN on your box: provider list (9), locked VPN details, best-server picker (closest, then fewest connections), Link Device 3rd column, box collect/report endpoints. 4 picker tests pass.
- [x] BM Player 5.62 (373) built-in WireGuard VPN, released; NordVPN token / Surfshark key auto-pick best server, others paste a WireGuard file.
- [ ] Try VPN on a real box with a real VPN account: no box or VPN account available here.
- [ ] Owner Tools VPN providers on/off list (admins can already be given it; screen not built yet).
- [x] Built, BM-signed and publicly released Android 5.63 (374) with Private DNS (Cloudflare then Google encrypted lookups for channel-list/TV guide servers, 3s fallback to normal DNS, on by default, Settings switch); 385 tests pass. Public download is byte-identical, SHA-256 9ac1ee4d059bc32184b6a633d6836cb1ce9f6dd47a15eed25c6f1d4e9477326e. VPN on your box removed; physical-box verification unavailable.

## BM Player themes
- [x] Theme mock-ups (23) for approval
- [x] Outside-stadium versions of the 12 football themes for comparison
- [x] Released themes: box 5.71 (382), Windows 0.4.106, Mac 0.1.107; public downloads byte-identical to builds. Real-device check unavailable.
- [x] Admin Themes page: owner can switch off/remove themes

## Stream address protection
- [x] Seal server address and username on the box (Keystore)
- [x] Remove outside video players (exposed the stream address)
- [x] Release box 5.77
- [x] Remove old VLC app hand-off; release box 5.78

- [x] Refresh cross-device watched positions before opening titles from Favourites/Recently watched on Android, Fire TV, phone and shared Windows/Mac code.
- [ ] Verify the Favourites hand-off on physical players after new app releases; no physical players are connected and release was not requested.

- [x] Built, signed, uploaded and registered box 6.29 (440), Windows 0.4.121 and universal Mac 0.1.121 with the Favourites resume-position fix; 433 Android and 212 desktop tests pass, public downloads match built hashes. Physical-device hand-off remains unverified (no connected devices).

- [x] Private DNS home switch released (box 6.31, Windows 0.4.123, Mac 0.1.123)
- [x] Released Windows 0.4.128 and Mac 0.1.128: Films/Series merged Search+Voice into one Search pill opening a type-or-voice dialog; TV guide opens on UK | Free to air (no All). 208 desktop tests pass; installers verified by extraction; live downloads serve exact new bytes. Physical-device check unavailable.
- [x] Referral credit for referrer (new customer first order only), Referrals page with reward table
