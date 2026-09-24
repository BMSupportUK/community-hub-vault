# Reliable sports-import format registry

## Goal
Repair MLB Extra Innings from the exact dated source and make known listing formats reusable, testable rules instead of one-off fixes.

## Build
- Replace the MLB Extra Innings draft with only the events from the latest source post, preserving each timestamp’s real UK date and removing leftover rows from the previous import.
- Add a protected sports-import format registry containing every known provider format, identifying examples, date/time rules, channel/title rules, and active status.
- Seed the registry with all formats already documented and supported: provider timestamps, named timestamps, Tennis/MLS slots, Rugby Pass pipes, Game Pass colons, channel-first rows, title-above-time rows, and related established layouts.
- Cross-reference every import against the registry before saving. Require a recognized format, parsed events, retained event count, valid date/time/title/channel fields, and an exact formatter round trip.
- Reject unsafe imports instead of writing a damaged guide, with a clear review-queue reason explaining what failed.
- Show the matched format and verification result in the importer preview so staff can confirm it before importing.
- Add regression tests using the real MLB post and representative examples from every registered format.

## Technical details
- Add one authenticated, staff-readable registry table with explicit grants and row-level access; changes remain service/admin controlled.
- Keep format matching and validation deterministic in shared parser code; the database stores the authoritative enabled formats and examples.
- Existing guide merges will preserve explicitly dated entries, deduplicate exact events, and never carry old rows into a newly dated provider schedule when that provider sends a replacement schedule.

## Verification
- Parse and round-trip the exact MLB source with Bun.
- Confirm the repaired draft contains 12 rows: MLB 01–12, dated Thursday 24th or Friday 25th according to converted UK start time.
- Confirm an unknown or lossy format cannot be imported.
- Confirm the app build is healthy.
