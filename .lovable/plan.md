## Goal

Remove the avatar/account dropdown menu from the top header and merge its options into the bottom-left profile bar. The avatar in the profile bar becomes the trigger, and clicking it opens the same menu — popping **upward** above the bar.

## Changes

### 1. `src/components/app/UserAvatarMenu.tsx` — make it work bottom-anchored
- Accept a new optional prop `variant?: "header" | "bar"` (default `"header"` to keep current behavior elsewhere if reused).
- When `variant === "bar"`:
  - Replace the rounded "pill" trigger (avatar + name + role badge + status dot) with a bare avatar-only trigger that matches the size/styling of the avatar already shown in the profile bar (so it visually replaces it rather than stacking next to it).
  - Change `DropdownMenuContent` props from `align="end" sideOffset={8}` (drops down-right from header) to `side="top" align="start" sideOffset={8}` so the menu opens **upward** above the bar.
- Keep all existing menu items unchanged: Edit profile, View profile, Copy username, Security & 2FA, Admin dashboard (if admin), Sign out.

### 2. `src/components/app/ChannelColumn.tsx` — wire the avatar to open the menu
- In the bottom profile bar (currently renders two plain `<img>` avatars — one in the 72px rail-overlap section on `lg`, one inline on mobile), replace each avatar with `<UserAvatarMenu variant="bar" />`.
- Keep the name + Online/Away status text and the right-side action cluster (`MentionsBadge`, `NotificationBell`, sign-out `LogOut` button) exactly as they are.
- Optional cleanup: since "Sign out" is now also reachable via the avatar menu, the standalone `LogOut` button in the bar becomes redundant. **Leave it in place** unless you want it removed — call that out if so.

### 3. `src/routes/_authenticated.tsx` — remove from header
- Remove the `<UserAvatarMenu />` usage at line 152 and its import at line 11.
- Leave the rest of the header (logo, search, etc.) intact.

## Technical notes

- `UserAvatarMenu` already handles auth state, profile fetching, realtime profile updates, and the sign-out flow — no logic changes needed beyond the trigger/positioning variant.
- The bar lives inside `ChannelColumn`, which has `relative z-10` and overlays the IconRail. The popup uses Radix `DropdownMenuContent` which portals to `body`, so it will not be clipped by the bar's overflow.
- No backend, schema, or auth changes.

## Out of scope

- Visual restyle of the menu content itself (header card with nameplate, items list) — kept identical.
- Pages that don't render `ChannelColumn` (e.g. `/tickets`, `/profile`): the avatar menu currently lives in the global header and would disappear there. The bottom profile bar is only present on talk-style pages. **Confirm:** is it OK that non-talk pages lose the account menu from the header, or should those pages also show the bar / keep the header menu as a fallback?
