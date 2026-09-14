# Personal Theme tab

## Goal
Add an owner-only **Theme** tab to the main BM Support profile, allowing each signed-in user to choose from the five themes already offered: Vibrant Purple, Crimson & Rose, Electric Ocean, Sunset Blaze, and Pink Pulse.

## Changes
- Add **Theme** to the profile tabs beside Notifications, visible only when viewing your own profile.
- Show the existing theme choices as clear colour-preview cards with an active indicator and immediate visual preview.
- Save the selected theme to the user’s own profile so it follows their account across devices and sessions.
- Keep the admin-selected theme as the site-wide default for users who have not chosen a personal theme.
- Update the shared theme loader so a personal choice overrides the site default without changing anyone else’s theme.
- Keep the current admin theme control, but clarify that it changes the default theme rather than every user’s personal selection.

## Technical details
- Add a nullable, validated `preferred_theme` field to user profiles; existing self-update access rules will protect it.
- Refactor the theme choices into a shared picker used by both the profile tab and admin default-theme control.
- Preserve the existing local cache to avoid colour flashes during startup, then reconcile it with the signed-in user’s saved preference.
- Ensure theme changes update immediately and remain correct after reload, sign-out, and account switching.

## Validation
- Verify each theme can be selected from the owner’s profile and persists after reload.
- Verify another member’s profile does not expose the Theme tab.
- Verify users without a personal choice receive the admin default.
- Check desktop and mobile layouts, type validation, preview build, and browser console errors.
