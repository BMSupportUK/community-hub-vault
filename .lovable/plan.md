# Replace the Fan Zone profile pill with New Content

## Changes
- Remove the “Profile & Settings” pill from the Boro Fan Zone header.
- Add a “New Content” pill linking to the existing full New Content page.
- Show a live count of forum posts added since the member last opened that page.
- Record the member’s latest visit so the count resets, while future posts increase it again.

## Technical details
- Store one private per-member “last viewed” timestamp in Lovable Cloud with row-level access limited to that member.
- Refresh the pill count when forum posts change.
- Keep all existing moderation, search, ignore, mentions, and profile-completion controls unchanged.
