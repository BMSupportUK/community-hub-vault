# Merge imports oldest-first, always

## What goes wrong now
- When staff merge queued posts into one import, the merged listing should read oldest post first, newest last.
- The merge does try to order by when each post arrived — but when a post is split into parts, each part is re-saved with the split time as its arrival time, not the original post's time. So a split part of an older post is treated as the newest post and lands at the bottom of the merge.
- Parts numbered 10 or more also sort before part 2, because the part numbers are compared as text.

## Changes
- When a post is split into parts (any of the three split paths), each part keeps the original post's arrival time instead of getting a fresh one.
- Make the merge ordering part-number-aware, so part 2 always comes before part 10.
- Keep the existing rule that the oldest post's heading becomes the merged import's heading.
- Add a permanent regression test: merging a mix of whole posts and split parts always produces oldest-first output, including a post split into more than 9 parts.

## Verification
- Run the sports import test suite; all existing format tests must still pass.
- Confirm with the real queue data that a split post's parts merge in their original order.
- Confirm the app still builds.
