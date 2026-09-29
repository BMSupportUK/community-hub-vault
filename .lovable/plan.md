# Add an Away status to the Talk staff list

## What will change
- When a staff member has DND active, their Talk channel staff row will show **“Away - From the office.”**
- The Away status will take priority over the usual Working or Off duty text while DND is active.
- Keep the existing DND countdown, nameplate, channel location, ticket button, and live presence behaviour unchanged.

## Technical details
- Add a small status-line component in the existing staff-list file that reads the same live DND state already used by the countdown.
- Use that status component only in the Talk channel sidebar row, without changing Talk presence or ticket-channel code.
- Check the app build and verify the staff list in the browser.
