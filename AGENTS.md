# Project Architecture Rules

- Sports guides preserve published status; headings prefix event names, never channels. Keep the BM loading cover through hydration and router pending.
- UFC multi-time imports attach all listed channels to every slot. Triller `Event N` becomes channel `Triller TV N`.
- Public sports guides return only validated date, time and event names; never expose free-text notes, descriptions or channel lines, because channel heuristics can miss unfamiliar feed names.
- Ads alternate Adsterra/AdSense; refresh visible Adsterra every 60s, never AdSense.
- Header starts collapsed (slim bar) except the home page, which starts open; re-collapses per navigation (home re-opens). Talk channels add channel name; Fan Zone never shows it.
- Back-to-top reacts only to page-level scrollers, never dialogs or inner chat/reply panes.
- NFL Sunday Ticket uses stated UK time, channel `NFL NN`, next-line fixture; drop its header and never apply the WF rule.
- Corrected sports formats need permanent split/safety/read-back tests. DAZN inline slots stay separate; qualifiers extend the title above.
- Manual sports splits preserve both halves; only adjacent headings move, and shared headings copy to the second half.
- Gmail forwarding confirmations are captured by the email receiver and shown only to admins on the Bank Transfer page.
- Talk: show all staff/channel; fit composer and people. Mobile guide PDFs render in-page.
- Talk presence: channel exit broadcasts leave/untracks next task; sign-out also removes the shared channel without respawn, preventing stale online users.
- Talk staff sidebar status: active DND overrides Working/Off duty text with “Away - From the office.” while retaining the countdown.
- Android spoken alerts use dedicated versioned notification channels; change the channel ID when correcting a sound because Android keeps a channel's original sound permanently.
- Manual orders use password-gated checkout links and order-only chat; paid, non-cancelled orders can open published guides through the same credentials.
- Shop sales use secure checkout; after payment, staff or the customer starts account setup before QD/fulfilment controls appear.
- Manual-order login details saved before the customer has an account are held privately per order and moved into their credentials when they claim the checkout — keeps one source of truth in the admin credentials list.
