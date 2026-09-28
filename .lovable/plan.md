# Make Talk Channels mobile friendly

## Changes
- Keep the Talk Channel fitted to the phone screen, with the messages scrolling inside the page and the message box remaining reachable above the phone’s safe area and keyboard.
- Add a compact mobile channel header with buttons to open Channels and Staff/Members, so the right-side staff and member information is no longer hidden on phones.
- Show Staff and Members in a full-height mobile panel while preserving the existing desktop sidebar and all current online/offline counts, working status, break countdowns, channel locations and ticket details.
- Reflow message rows for narrow screens: reduce excess avatar space and page padding, let name cards and status information fit cleanly, and remove the fixed minimum width that clips message editing.
- Make reply previews, message menus, GIFs and mute notices stay within the phone width without covering the message box.
- Rework the message composer on phones into a stable text row with compact actions, while keeping every existing formatting, attachment, emoji, GIF and send function.
- Keep tablet and desktop layouts unchanged.

## Safety
- Presentation changes only. Do not alter Talk presence, messages, unread counters, role flashes, ticket logic, permissions, staff controls or realtime behaviour.
- Preserve the existing desktop channel column width and do not restore the removed Talk sidebar advert.

## Verification
- Check a Talk Channel at 390 × 844 and at a large desktop size.
- Confirm Channels and Staff/Members can be opened and closed on mobile.
- Confirm messages, editing, replies, menus, GIFs and the composer fit without horizontal scrolling or overlap.
- Confirm staff controls remain clickable and desktop sidebars remain unchanged.
