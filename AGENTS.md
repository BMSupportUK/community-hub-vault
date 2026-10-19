# Project Architecture Rules

- Sports guides keep publication status; headings prefix events, not channels; document scrolling; channels only beneath Available channels; BM loads through hydration/router pending.
- UFC multi-time imports attach all listed channels to every slot. Triller `Event N` becomes channel `Triller TV N`.
- Public sports guides expose only validated dates, times, event names; cards flag local times on a different UK day.
- Advert slots cycle only BM Support's own affiliate banners in random equal-time order, tracking views and clicks per banner; Member Home and the public landing are separate zones; Fan Zone adds Forum-enabled BM banners to its own.
- Member Home: staff keep image + greeting left; members get "Hey" + nameplate + "Welcome to The Customer Portal" above a capped subscription box closing the gap (compact on phones).
- Header starts collapsed (slim bar) ONLY on tickets and Talk channels, open everywhere else; re-resets each navigation. Talk adds the channel name; Fan Zone never does.
- Back-to-top ignores dialogs/inner panes. Bound Ticket/Talk viewports; cap and scroll mobile ticket headers to preserve messages and composers.
- NHL Center Ice treats its listing clock as ET and converts to the correct UK date/time, ignoring supplied UK clocks; NFL Sunday Ticket and NBA League Pass use stated UK times.
- Sports formats need split/safety/read-back tests; normalize dual-clock typos before title pairing; DAZN inline slots stay separate, qualifiers extend titles.
- Manual sports splits preserve both halves; only adjacent headings move, and shared headings copy to the second half.
- Gmail forwarding confirmations are captured by the email receiver and shown only to admins on the Bank Transfer page.
- Talk: show all staff/channel; fit composer and people.
- Ticket staff scope shares one DB predicate across reads, updates and replies: include Orders support, exclude owner-management and order-linked sales to keep list/thread access aligned.
- Talk presence: channel exit broadcasts leave/untracks next task; sign-out removes the shared channel without respawn so no stale online users remain.
- Staff Away reads user_dnd_status (current window); triggers store shift-linked history.
- Android alerts use per-type tones on versioned channels; sound corrections need a new channel ID because Android retains the first sound.
- Shift reminders use only the scheduled-reminders path; the legacy shift-phone-alerts cron stays disabled to prevent duplicate or post-clock-in alerts.
- Manual orders use password-gated checkout links and order-only chat; paid, non-cancelled orders can open published guides through the same credentials.
- Checkout mutations check admin/management in handlers/RPCs; email-free staff reads use a narrow order-summary RPC.
- Pre-account manual logins are order-private; claim moves them to customer credentials, the admin list's source of truth.
- Signed-out checkout app logins use only token-gated SECURITY DEFINER reads, never the staff credentials view.
- Guide videos use private storage and short-lived signed links; ordered `video_steps` pair each private video with one visible action.
- VPN blocking applies only to direct BM registration; link/typed referrals and Fan Zone bypass it; approved referrals skip access-request alerts.
- Ask location opt-in only at the direct BM security gate, never referrals/Fan Zone; refusal blocks ticket requests and tags appeals. Elsewhere capture GPS silently only with existing permission.
- Dialogs stay within the dynamic mobile viewport; dense views drop secondary columns on phones.
- Square/Stripe payments use shared server invoice creation with verified order/token access; BM Support PDFs remain post-payment receipts.
- Knowledge Base fills the page; category and ratings rails keep guides scannable.
- Video help uses P2P WebRTC and a fixed-size customer canvas; rotation must not reshape or rebuild the encoder (causes black video).
- Gender-matched customer defaults never replace custom picks and exclude staff/Fan Zone-only users.
- BM inbox stays separate from Fan Zone/Talk: participant-only tables, authenticated RPCs, admin/management-only report snapshots.
- Seasonal Talk/inbox uses one date helper and overlay; locked chat stays untouched.
- Dashboard access, header button label and header tab gates come from `src/lib/admin-panel-access.ts`; a header-tabbed page has no tool card.
<!-- LOVABLE:BEGIN -->
- Members and role management renders beneath subscriptions in the Customers dashboard tab; legacy member-management URLs redirect there to keep one destination while retaining the existing security gate.
- Break popup/sound shares one session-persisted per-break claim; expiry updates silently to prevent replay after dismiss, lock or reload.
- Fantasy scoring gives full rates only to players who are in the manager's XI AND started the real match (stored per stat row as `started` from the FotMob team sheet); cards are counted from the match timeline as well as player stats, because FotMob's player table often omits them.
- Customer renewal-date corrections use a separate audited record and admin-only RPC; the details read overlays it to preserve payments and credential expiry.
- Manual subscription groups use explicit checkout-link customer/account IDs, never site-profile or email matching; admin RPCs validate grouping and renewal targets to keep manual accounts independent.
- Manual credential access verifies email codes plus a salted PBKDF2 PIN atomically; initial enrollment checks an existing paid manual TV login so mailbox access alone cannot enroll or reset a PIN.
- Manual registration exceptions persist on checkout links, enforced by admin-only RPCs and a write trigger; creation saves atomically and PIN access remains independent.
<!-- LOVABLE:END -->
- Uploaded sound overrides resolve inside playSound so all web callers use them; closed-app Android tones need an APK rebuild.
- Tests use `bun test`, not Vitest-only APIs; swap globals with `Object.defineProperty` and restore.
- DB triggers give bannerless sports guides a cover; adverts always render, so every save path keeps both.

- Profit uses pence; unknown fees provisional, known fees fixed. Orders/profit use settled groups. Invoice sync repairs rows; demos never affect totals. Stripe checks retry missing resources across accounts.

- Breaks use UK time; duplicate-safe starters recheck records. Empty plans retry; real times stay fixed. Rota UI/write guards close days at UK midnight.
