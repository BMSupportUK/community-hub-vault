# Fix the merged DAZN sports import

## What will change
- Support DAZN rows where the programme name and dated time slot were merged onto one line.
- Support DAZN programme qualifiers before the dated slot, such as venue names after the title.
- Keep every event paired with its own DAZN channel and prevent those rows being attached to the previous event.
- Add the exact failed DAZN post as a permanent regression test covering parsing, safety checks, and saved read-back.

## Current queued post
- Repair the importer against the pending merged DAZN post already in the review queue; no guide will be published automatically.

## Verification
- Confirm all 26 timed DAZN rows become 26 events with no import errors or dropped-row warning.
- Run the full sports-import test suite and app checks.
