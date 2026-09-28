# Make corrected sports imports stay fixed

## Immediate repair

1. Reproduce both current split posts through the same screens and final save action used by staff, not only through the text parser.
2. Capture the exact final-save failure for Greyhound Racing and Ultimate Pool, fix that shared cause, and keep both queue items intact until each save succeeds.
3. Verify each result from queue → category/subcategory → selected guide → import → saved guide read-back. Preserve each guide’s existing published or draft status.

## Permanent format memory

1. Keep one checked-in fixture for every corrected real post format, containing the original pasted text and the exact events, times, headings, and channels expected.
2. Run every fixture through four stages: raw parsing, split result, pre-import safety check, and final saved/read-back output.
3. Add the two current split posts and Asian Games to that fixture collection, alongside the existing WST, Triller, NFL, UFC, Rugby Pass, MLB, Stan, Setanta, Cymru, FA Player, Fubo, Coupang, and NHL cases.
4. Make the fixture suite the required check for every future importer change, so a change cannot silently break a previously corrected layout.

## Safer queue handling

1. Make splitting atomic so the original item is replaced only when every new queue item is safely created; repeated clicks cannot duplicate or lose posts.
2. Keep the original queued post recoverable until all split items exist and pass validation.
3. Show the actual failed stage and message on the importer card instead of a generic failure.

## Acceptance checks

- Both current split posts import successfully into their selected existing guides.
- Neither event disappears, both channels remain attached correctly, and saved guide content reads back identically.
- Asian Games still imports as `ASIAN GAMES: Aichi Nagoya 2026` at 23:00 UK with both beIN channels.
- Every stored real-format fixture passes in one full regression run.
