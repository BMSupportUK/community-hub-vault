# Project Architecture Rules

- Sports-guide updates must preserve published status so live guides stay public.
- Headings prefix event names and never become channels. Rugby Pass `NN: event time (note)` keeps its note and numbered channel.
- Keep the BM loading cover through browser load/hydration and as the router pending screen.
- UFC multi-time imports must attach the complete listed UFC channel set to every time slot, never pair channels to times by position, because each feed carries every slot.
- Triller TV rows are `Triller TV | Event N: title time`; remove `Event N` from the title, keep the trailing time, and use `Triller TV N` as the channel so the source channel number is retained and saved guides read back unchanged.
- Public sports guides return only validated date, time and event names; never expose free-text notes, descriptions or channel lines, because channel heuristics can miss unfamiliar feed names.
- Ads alternate Adsterra/AdSense; refresh visible Adsterra every 60s, never AdSense.
- Header starts collapsed (slim bar) except the home page, which starts open; re-collapses per navigation (home re-opens). Talk channels add channel name; Fan Zone never shows it.
- Back-to-top reacts only to page-level scrollers, never dialogs or inner chat/reply panes.
- NFL Sunday Ticket rows are `NFL NN: ET time | UK time` with the fixture on the next line: use the stated UK time as-is, channel `NFL NN`, drop the `US | NFL Sunday Ticket` header; pipe rows are never split by the WF colon rule.
- Every corrected sports-import layout needs a permanent test covering split, safety, formatting and read-back; normalize escaped line breaks first.
- Manual sports-queue splits preserve both halves; only an adjacent heading may move with the split, and a shared heading is copied to the second half.
- Gmail forwarding confirmations are captured by the email receiver and shown only to admins on the Bank Transfer page.
- Talk: show all staff/channel; fit composer and people. Mobile guide PDFs render in-page.
- Talk presence: channel exit broadcasts leave/untracks next task; sign-out also removes the shared channel without respawn, preventing stale online users.
