## Goal

In the channel sidebar, the row of action icons (pencil rename, smiley icon, shield permissions, trash delete) currently only appears when you hover the channel row. Show them permanently underneath each channel name instead.

## Change

In `src/components/app/ChannelColumn.tsx` (around line 304), the action button row for each channel uses:

```
className="hidden group-hover/ch:flex items-center gap-1 pl-6 pr-2 pb-1 -mt-0.5 text-muted-foreground"
```

Replace `hidden group-hover/ch:flex` with `flex` so the icons render at all times directly under the channel link.

## Scope

- Only applies to per-channel icons (the screenshot example). Category-level icons stay hover-only (less clutter at the group header).
- Only admins/staff with edit permissions see this row in the first place (the row is conditionally rendered based on `g.onDeleteItem`, etc.) — no permission changes needed.
- Pure CSS class change, no logic or layout restructure.
