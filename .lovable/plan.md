Remove the "● Online / Away" status line shown under the display name in the bottom profile bar. The same status is already indicated by the colored dot on the avatar.

Change:
- In `src/components/app/ChannelColumn.tsx`, delete the `<div>` that renders the small colored dot + "Online" / "Away From The Office" text directly under the display name (lines ~402-405).
- Leave the avatar dot (in `UserAvatarMenu` bar variant) and everything else untouched.