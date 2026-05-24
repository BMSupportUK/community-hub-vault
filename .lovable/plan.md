## Goal

Restructure the bottom-left of the layout in pages that use the talk-style sidebar (ChannelColumn) — currently `/home`, `/shop`, `/moderation`, and the `Coming` placeholder. Today there are two visually disconnected stacks at the bottom-left:

- The narrow IconRail (72px) holds @ mentions, the notification bell, and the sign-out button at its bottom.
- The wider ChannelColumn shows a thin "DaneJ · Online" profile strip at its bottom.

The user wants these unified so the profile strip becomes the action bar.

## Changes

1. **ChannelColumn footer becomes the action bar**
   - File: `src/components/app/ChannelColumn.tsx`
   - In the user profile block (lines ~371–391):
     - Add a right-aligned cluster inside the same row containing: `<MentionsBadge />`, `<NotificationBell />`, and a sign-out button (calls `signOut()` then `navigate({ to: "/login" })`).
     - Keep the avatar + name + Online/Away on the left, push the icon cluster to the right with `ml-auto`.
     - Stretch the bar to the screen's left edge: replace the current `px-3` row inside the column with a wrapper that uses a negative left margin equal to the IconRail width (`-ml-[72px]` on `lg:` only, plain on mobile since the rail is hidden) and re-adds `pl-3` inside so content stays aligned with the column contents. Background remains `bg-rail` so it visually continues the rail.

2. **IconRail bottom trimmed**
   - File: `src/components/app/IconRail.tsx`
   - Remove the `MentionsBadge`, `NotificationBell`, and sign-out button from the bottom of the rail (lines ~201–206). Keep `mt-auto` spacer so nav items still top-align.
   - Reduce the rail's bottom padding so it visually ends just above the new merged bar's height (~56px / `h-14`). Use `pb-14` on the `aside` so the rail's interactive area stops where the merged bar begins.
   - These icons now live exclusively in the ChannelColumn footer on talk-sidebar pages.

3. **Pages without ChannelColumn**
   - On routes that don't render ChannelColumn (e.g. `/tickets`, `/profile`, etc.), the IconRail would lose access to @ mentions / bell / sign out. To avoid that regression, keep the rail icons but render them conditionally: pass a new `compactFooter` prop into `IconRail` (default `false` = show icons as today). The layouts that mount ChannelColumn (`home.tsx`, `shop.tsx`, `moderation.tsx`, `Coming.tsx`) set `compactFooter` indirectly by… actually simpler: keep the rail icons always, and just visually align the merged bar to sit on top of them. Final approach below.

### Final approach (simpler, no per-route prop)

- Keep IconRail untouched in terms of contents (mentions/bell/signout stay) — they remain the fallback for non-talk pages.
- On talk pages (ChannelColumn present), the ChannelColumn's new full-width footer bar visually covers the bottom of the IconRail with `bg-rail` and `z-10`, so the rail's bottom icons aren't visible there. The bar's left section (over the rail area, 72px) shows just the avatar; the column-width section shows the name + status + action icons (@ mentions, bell, sign out).
- This avoids touching every consumer route and keeps non-talk pages unchanged.

Concretely in `ChannelColumn.tsx`:

```text
[ avatar (72px wide area, centered) │ name + Online · · · [@] [bell] [logout] ]
└────── overlaps IconRail ──────────┴───────── ChannelColumn width ───────────┘
```

- Wrap the footer in `relative z-10 -ml-0 lg:-ml-[72px] bg-rail border-t border-border h-14 flex items-center`.
- First child: 72px square holding the avatar (centered) — visible only on `lg`.
- On mobile (rail hidden), avatar stays inline in the existing 56px-tall row.
- Right side: existing name/status, then `<div class="ml-auto flex items-center gap-1 pr-2">` with `MentionsBadge`, `NotificationBell`, and a sign-out button styled like the rail's existing one.

## Technical notes

- Sign-out handler in the footer: reuse the pattern from `IconRail` (`await signOut(); navigate({ to: "/login" })`). `useAuth` and `useNavigate` are already imported in `ChannelColumn.tsx` — verify and add if missing.
- Imports to add in `ChannelColumn.tsx`: `LogOut` from `lucide-react`, `MentionsBadge`, `NotificationBell`, possibly `useNavigate` from `@tanstack/react-router`.
- No backend or schema changes.

## Files touched

- `src/components/app/ChannelColumn.tsx` — restructure footer, add overlap, add icons.

## Out of scope

- Any change to non-talk pages or the IconRail itself.
- Visual restyle of the icons beyond matching the existing rail hover treatment.
