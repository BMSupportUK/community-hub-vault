# Gender-based default staff name plates

## What will change
- Add female versions of the existing **Staff**, **Moderator**, and **Management/Admin** name plates.
- Keep each plate the same slim Discord-style size, gradient, animation, and right-side icon placement as its male version.
- Add a clear **Male / Female** choice to **Edit profile**, shown only for BM Support staff roles.
- Use that choice to select the correct default plate automatically:
  - Staff → male or female office worker
  - Moderator → male or female security guard
  - Admin/Management → male or female business owner
- Keep a staff member’s manually selected name plate unchanged. The gender-based plate applies only while they use the role default.
- Preserve existing staff accounts as **Male** initially so no current plate changes unexpectedly.

## Technical details
- Add a constrained profile field for the two choices and update the generated database types.
- Add three private female staff name plate records and grants, alongside the existing male records.
- Extend the role-default database function and trigger so role changes and profile choice changes equip the correct default without overriding custom choices.
- Add three transparent female role icons to the shared name plate renderer; no Talk-channel code will be changed.
- Verify profile saving and all six defaults on Home/Profile, plus one representative plate in Talk, on desktop and phone widths.
