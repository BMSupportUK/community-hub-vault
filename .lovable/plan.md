# Correct UFC multi-time imports

## Changes
- Update the UFC multi-time rule so every listed time receives the complete channel list.
- Keep overnight time rollover, so after-midnight slots move to the next date.
- Correct the queued UFC post without removing it from the review queue.
- Add a regression check confirming every generated event carries all channels.

## Verification
- Parse the actual queued post and confirm three events, three times, and the full channel list on each event.
- Confirm the app build remains healthy.
