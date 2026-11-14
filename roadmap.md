# Roadmap

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
- [ ] Release 4.86 and check Movie Premiere/VIP Cinema freeze reports on the first player; waits on the user's go-ahead and a box updating.
