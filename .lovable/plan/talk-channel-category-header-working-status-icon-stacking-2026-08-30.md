# Talk channel category header + Working Status icon stacking

## 1. Category controls beside the category name
- Update `src/components/app/ChannelColumn.tsx` so the category move-up, move-down, add-channel, and settings icons sit on the same line as the category name, immediately after the label.
- Keep the category expand arrow and optional category icon at the start of the row.
- Remove the separate second-row control container.
- Preserve existing tooltips, disabled states, permission checks, and click handlers.

## 2. Working Status icons stacking when clipped
- Update `src/components/app/WorkingStatusBox.tsx` so the header action icons (Clock, Calendar, Do Not Disturb) wrap/stack instead of being clipped when the box is narrow.
- Ensure the header still uses the existing gradient and spacing; only change the icon container to allow wrapping.

## Verification
- Confirm category icons are visible on the same row as the name in both collapsed and expanded states.
- Resize the Working Status box to a narrow width and confirm the icons wrap to a second row instead of being cut off.
