---
name: sports import formats
description: Provider sports listing row formats and verification expectations for imports
type: feature
---
Sports imports must keep channel labels separate from event names.
Event titles must use `v` as the matchup separator, not `&`. Normalize imported `x`, `v.`, `vs`, and spaced `&` matchup separators to `v` while leaving channel names untouched. This corrects the prior `&` rule at the user's explicit request.
Any event without its own day or date always uses today's UK date. Never infer tomorrow merely because its clock is earlier than the previous event; only an explicit day/date may move it.

Known formats:
- Tennis TV / MLS style: `Event @ Sep 23 9:30 PM - Competition :Channel 01` means event title is before `@`, optional competition is appended, and the text after `:` is the channel.
- Provider timestamp style: `MLB 01 : Nationals x Tigers start:2026-09-23 18:10:00 stop:...` means `MLB 01` is the channel and `Nationals x Tigers` is the event.
- Named provider timestamp style: `wnba: 1 name: New York Liberty x Atlanta Dream start:...` means `WNBA 1` is the channel and the `name:` value is the event.

Before claiming an import fix, verify the parser with Bun against the real post format and check the stored guide body in the database.
- Channel-first pipe style: `Rugby Pass 01 | Ultimate Sevens Rugby - London Grand Final 17:30` → channel before `|`, event after, trailing clock is the time. `VIP | Provider` lines are headings, not events.
- Game Pass colon style: `US | NFL Sunday Ticket` is a heading only. `NFL01: Falcons @ Packers 01:15` means event `Falcons & Packers`, channel `NFL 01`, and time `01:15`; never use the heading as the event name.
Every new format: add it here, Bun-test raw AND round-trip, then repair the draft — never make the user report it twice.
- Permanent competition safeguard: an explicit post heading must match the selected guide before saving. A combined post containing a different competition heading is blocked, and section headings are never appended to the preceding event's channel list.
- Provider `start:` stamps are already UK wall-clock time — never add the BST hour.
- Setanta colon style: `Setanta: 1: Panathinaikos - Paris start:...` → channel `Setanta 1`, event `Panathinaikos & Paris`.
- Flosports (Flo College / Flo Racing) `Event @ Sep 24 12:00 PM :Flo College 01` times are US Eastern; convert to UK automatically.

## Peacock "title above slot" dump
"Title" line, then "- DD-MM-YYYY 11:00 AM until DD-MM-YYYY 9:30 PM - PEACOCK 0 HD". Each pair is reordered to slot → title → channel before parsing. "ISO 2 V 9.25.26" — a V before a date is a feed tag, never "vs"/"&".
- UFC Fightpass uses the same "title above slot" dump as Peacock, under a heading like `**## UFC FIGHTPASS**` and with slot lines that may start with " - ". The heading must never become the first fight's title. Times are UK wall-clock time (GMT/UK import choice). `VS` changes to `&`. Example: `00:55 · UFC BJJ 11: MUSUMECI & MITCHELL · UFC 1 HD`.
- DAZN uses the same title-above-slot dump. Ignore an isolated one-letter marker between the title and slot. A final clipped channel suffix such as `Dazn 13 H` means `Dazn 13 HD`. Merged queue items must clear inherited single-post date, time and channels; the raw merged post owns each event's values.
- ESPN+ uses the same title-above-slot dump (`Title` then `- 25-09-2026 8:55 PM until ... - ESPN 5 HD`), UK wall-clock times. Rules: keep `#11`-style rankings in titles (`#11 TCU & Cincinnati`); a show name like `Fri, 9/25 - ESPN FC` stays whole — never split `ESPN FC` off as a channel; re-importing into an existing guide drops entries already more than 10 hours past their start so yesterday's list never stays on top. If a post carries another provider's rows (e.g. DAZN slots at the top of an ESPN post), they belong to that provider's guide, not ESPN+.
- Every import runs the double-check (`checkSportsImport`): missing time, channel-as-title, leftover slot text, missing channel, duplicates, stale >10h, dropped timed rows, and exact read-back. Errors block import unless the admin ticks "import anyway". When fixing a new format, make the check pass on the real post.
- Super League Plus colon-time-first style: `Super League Plus 01:  20:00 Leeds Rhinos vs Warrington Wolves` → channel `Super League Plus 01`, time `20:00` (UK), event `Leeds Rhinos & Warrington Wolves`. Works for any `Channel NN: HH:MM Title` row.
- URC / Premier Sports region-tag style: channel rows `UK | Premier Sports 1` / `IRE | Premier Sports 1` → KEEP the region, normalise to `UK Premier Sports 1` / `IRE Premier Sports 2`. UK and IRE are different feeds — never strip the tag.
- Scottish Cup region-suffix style: `8:00pm UK / 3:00pm ET`, `QUEEN OF THE SOUTH v RANGERS B`, then `Premier Sports 1 UK` and `Premier Sports 1 IRE` → 20:00 BST, `QUEEN OF THE SOUTH v RANGERS B`, channels `UK Premier Sports 1` and `IRE Premier Sports 1`. The UK and IRE channels are distinct; move the suffix to the front, never discard it. Repair stored guides as well as future imports.
- Coupang pipe + double-slash style: `Coupang 1 | Azerbaijan Grand Prix Race // UK Sat 26 Sep 11:15am // ET Sat 26 Sep 6:15am` → channel `Coupang 1`, event, UK time and the row's own date. Rows containing `//` must never be split by the Rugby Pass channel-pipe rule (that broke it before).
- Stan Sport event style: `Stan event: EventS1 name: Harlequins v Bath - PREM Rugby Round 1 start:2026-09-25 19:40:09 stop:...` → channel `Stan Event S1`, event is the complete `name:` value (`v` → `&`), time from `start:` as UK wall-clock time (no BST shift). Heading `**STAN Sport**` and `---` are not events. On saved read-back, punctuation inside the name stays in the name: `Seoul: Day 5 - WTA 250` must not turn `WTA 250` into a channel, and `Day 1 • Night Session - Laver Cup 2026` must remain one title.

## NHL Center Ice (US | NHL Center Ice)
Raw: `NHL | 01 - 7pm ET | 12am UK` then fixture on next line (`Bruins at Capitals`).
Rule: time = the stated UK time as-is (never convert ET, no +1h), title = next line, channel = `NHL 01`.
Header `US | NHL Center Ice` is dropped. Tested: 3 rows -> 3 events (12am/12:30am/1am, NHL 01/02/03).
Evening-ET rows that are after midnight UK are tagged with the next UK weekday so they post on the right day.
- Cymru TV channel-first bracket style: `Cymru Football 1 - Barry Town United - Connah’s Quay Nomads [26th Sep - 2:25pm BST]` → channel `Cymru Football 1`, event `Barry Town United v Connah’s Quay Nomads`, date `26th Sep`, and time `2:25pm BST`. Every row owns its bracketed date/time; the `UK | Cymru TV` heading is never an event.

## Scottish Cup channel break (permanent)
Source lists "Premier Sports 1 UK" and "Premier Sports 1 IRE" on separate lines. Keep each channel on its own line with the exact source names — never join with " | " and never reorder to "UK Premier Sports 1". Formatter: regional-suffix (UK/IRE) channel lists are output one per line.

## Scottish Cup Streams row (permanent)
Source: "ˢ ᴾ ᶠ ᴸ Cup 01 | 20:00 Queen of the South vs Rangers II" (channel | leading time + event, one line). Break into time / "Queen of the South v Rangers II" / channel "SPFL Cup 01". Small-letter tags convert to plain capitals.

## UFC Streams multi-slot post (permanent)
Source: "**UFC Fight Night: A vs. B**" / "`10pm | 11pm | 1am UK`" / "UFC 01" / "UFC 02" / "UFC 03". Every time carries the complete channel list: UFC 01, UFC 02 and UFC 03. Never pair channels to times by position. After-midnight am slots roll to the next day.

## Rugby Pass multi-channel post (permanent)
Source: "Rugby Pass 01 | Lions v Leinster 12:00" rows, with bare continuation rows like "Stade Francais v Lyon 15:30" under a channel row. Each "Channel NN | Event HH:MM" row splits into time / event / channel; every bare "Event HH:MM" continuation row inherits the channel of the row above it, so each fixture keeps its own channel (e.g. Rugby Pass 02 gets Perpignan v Bordeaux Begles, Stade Francais v Lyon and Zebre v Bulls). Only applies when the post contains channel-pipe rows.

## Overnight rollover on daily posts (permanent)
When a daily post's times run past midnight (e.g. 23:00 then 01:00 under one date), the early-morning events automatically move to the next day's date, and every following event stays on the rolled date until the post names a new day. A drop of more than 6 hours between consecutive times triggers the roll.

## Fubo Sports post (permanent)
Format: `Fubo Sports 1 | Show name // UK Sat 26 Sep 11:00am // ET Sat 26 Sep 6:00am`. Channel before the pipe, show after, use the UK date/time (ignore ET). Show names containing the brand (e.g. "Fubo Sports News") are valid titles — never flag as channel/title swapped when the row's channel is a real channel label.
