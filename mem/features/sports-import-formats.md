---
name: sports import formats
description: Provider sports listing row formats and verification expectations for imports
type: feature
---
Sports imports must keep channel labels separate from event names.
Event titles must use `&` as the matchup separator. Normalize imported `x`, `v`, `v.` and `vs` separators to `&` while leaving channels separate.
Any event without its own day or date always uses today's UK date. Never infer tomorrow merely because its clock is earlier than the previous event; only an explicit day/date may move it.

Known formats:
- Tennis TV / MLS style: `Event @ Sep 23 9:30 PM - Competition :Channel 01` means event title is before `@`, optional competition is appended, and the text after `:` is the channel.
- Provider timestamp style: `MLB 01 : Nationals x Tigers start:2026-09-23 18:10:00 stop:...` means `MLB 01` is the channel and `Nationals x Tigers` is the event.
- Named provider timestamp style: `wnba: 1 name: New York Liberty x Atlanta Dream start:...` means `WNBA 1` is the channel and the `name:` value is the event.

Before claiming an import fix, verify the parser with Bun against the real post format and check the stored guide body in the database.
- Channel-first pipe style: `Rugby Pass 01 | Ultimate Sevens Rugby - London Grand Final 17:30` → channel before `|`, event after, trailing clock is the time. `VIP | Provider` lines are headings, not events.
- Game Pass colon style: `US | NFL Sunday Ticket` is a heading only. `NFL01: Falcons @ Packers 01:15` means event `Falcons & Packers`, channel `NFL 01`, and time `01:15`; never use the heading as the event name.
Every new format: add it here, Bun-test raw AND round-trip, then repair the draft — never make the user report it twice.
- Provider `start:` stamps are already UK wall-clock time — never add the BST hour.
- Setanta colon style: `Setanta: 1: Panathinaikos - Paris start:...` → channel `Setanta 1`, event `Panathinaikos & Paris`.
- Flosports (Flo College / Flo Racing) `Event @ Sep 24 12:00 PM :Flo College 01` times are US Eastern; convert to UK automatically.

## Peacock "title above slot" dump
"Title" line, then "- DD-MM-YYYY 11:00 AM until DD-MM-YYYY 9:30 PM - PEACOCK 0 HD". Each pair is reordered to slot → title → channel before parsing. "ISO 2 V 9.25.26" — a V before a date is a feed tag, never "vs"/"&".
