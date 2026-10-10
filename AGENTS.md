# Project Architecture Rules

- Sports guides preserve published status; headings prefix event names, not channels. Readers use document scrolling. All channels appear only beneath Available channels, including sole channels, for consistent placement. Keep BM loading through hydration/router pending.
- Sports cards flag local times on a different day from UK time to prevent date ambiguity.
- UFC multi-time imports attach all listed channels to every slot. Triller `Event N` becomes channel `Triller TV N`.
- Public sports guides expose only validated dates, times, and event names; never free-text notes, descriptions, or channel lines.
- Advert slots show only BM Support's own affiliate banners in random, equal-time cycles; track each displayed banner's views and clicks, keep Member Home and the public landing page as separate zones, and include BM Support banners enabled for Forum throughout Boro Fan Zone alongside dedicated Fan Zone banners.
- Member Home: staff keep image + greeting beneath (left column); members' "Hey" + name plate (no name text) + "Welcome to The Customer Portal" fills the right column above a subscription box that grows to close the gap (capped; compact on phones), its header showing only the clock.
- Header starts collapsed (slim bar) ONLY on the tickets page and Talk channels; every other BM Support page keeps it open. Re-resets on each navigation. Talk channels add channel name; Fan Zone never shows it.
- Back-to-top ignores dialogs/inner panes. Bound Ticket/Talk viewports; cap and scroll mobile ticket headers to preserve messages and composers.
- NHL Center Ice always treats its listing clock as ET and converts it to the correct UK date/time, ignoring supplied UK clocks; NFL Sunday Ticket and NBA League Pass use their stated UK times.
- Corrected sports formats need split/safety/read-back tests. DAZN inline slots stay separate; qualifiers extend titles.
- Manual sports splits preserve both halves; only adjacent headings move, and shared headings copy to the second half.
- Gmail forwarding confirmations are captured by the email receiver and shown only to admins on the Bank Transfer page.
- Talk: show all staff/channel; fit composer and people. Mobile guide PDFs render in-page.
- Talk presence: channel exit broadcasts leave/untracks next task; sign-out also removes the shared channel without respawn, preventing stale online users.
- Staff Away reads shared user_dnd_status; because it holds only the current window, Away history lives in a trigger-written table matched to shifts.
- Android spoken alerts use dedicated versioned notification channels; change the channel ID when correcting a sound because Android keeps a channel's original sound permanently.
- Shift reminders use only the scheduled-reminders path; the legacy shift-phone-alerts cron stays disabled to prevent duplicate or post-clock-in alerts.
- Manual orders use password-gated checkout links and order-only chat; paid, non-cancelled orders can open published guides through the same credentials.
- Secure checkout browses only reached stages, never reverses payment; staff completion requires confirmed account setup.
- Manual-order login details saved before the customer has an account are held privately per order and moved into their credentials when they claim the checkout — keeps one source of truth in the admin credentials list.
- How-to videos use private storage references and short-lived signed playback links so media is never exposed through a permanent public URL.
- Install-guide videos use ordered `video_steps` on each guide; each step is a separate private video so narration aligns with one visible action.
- New-account VPN blocking applies only to direct BM Support registration; any referral code (link or typed in) and Boro Fan Zone registrations bypass it.
- Referral-approved BM Support accounts never retain security-gate access-request notifications, because staff action is not required.
- The location opt-in is asked only on the security gate for direct (non-referral, non-Fan Zone) BM Support applicants; refusal blocks ticket requests and tags any appeal so staff see it. Elsewhere GPS is captured silently only when permission already exists.
- Shared dialogs must stay within the dynamic mobile viewport, while dense data views reduce secondary columns on phones so primary actions remain usable.
- Customer invoices are BM Support PDFs available only after confirmed payment; never expose Stripe or Square hosted invoice/receipt links because the app owns customer billing documents.
- Knowledge Base article reading uses the full available page with a responsive ratings rail, so long guides and media remain readable.
- Secure orders show wa.me video help only while is_business_open; never embed customer camera sessions.
- Gender-matched customer defaults never replace custom picks and exclude staff/Fan Zone-only users.
- BM inbox stays separate from Fan Zone/Talk: participant-only tables, authenticated RPCs, admin/management-only report snapshots.
- Seasonal Talk/inbox uses one date helper and overlay; locked chat stays untouched.
<!-- LOVABLE:BEGIN -->
- Break popup/sound shares one session-persisted per-break claim; expiry updates silently to prevent replay after dismiss, lock or reload.
- Fantasy scoring gives full rates only to players who are in the manager's XI AND started the real match (stored per stat row as `started` from the FotMob team sheet); cards are counted from the match timeline as well as player stats, because FotMob's player table often omits them.
<!-- LOVABLE:END -->
