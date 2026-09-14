# Vibrant Berry Glass Pink Theme

## Goal
Refine the existing **Pink Pulse** option into a colourful pink-only theme that feels vibrant and polished without clashing with BM Support’s current pages, imagery, or controls.

## Changes
- Replace the current berry/coral mix with a cohesive spectrum of deep raspberry, vivid hot pink, rose, and pale blush.
- Add layered translucent pink surfaces for menus, panels, dialogs, fields, cards, and the side rail, using restrained blur and pink-tinted borders.
- Strengthen the visual hierarchy so backgrounds stay deep, interactive controls are brighter, and text remains clearly readable.
- Rework theme gradients and glow effects to use pink-family hues only; remove the current coral/red appearance from decorative theme treatments.
- Keep neutral near-black and near-white for accessibility, while preserving meaningful success, warning, and error colours where users rely on them.
- Keep **Pink Pulse** as the existing selectable theme, so no new setting or migration is required.
- Update its selector swatches to accurately preview the refined palette.

## Compatibility and checks
- Preserve all existing page structures, typography, functionality, and the other four themes.
- Continue translating older purple-styled screens through the existing compatibility layer so Pink Pulse looks consistent across BM Support and Boro Fan Zone.
- Check representative public, authenticated, form, dialog, and side-rail screens at desktop and mobile widths for contrast, clipping, and unwanted non-pink decorative colours.
- Verify the app builds cleanly and that switching away from Pink Pulse leaves every other theme unchanged.

## Technical details
- Adjust only the semantic `theme-pink` colour, gradient, shadow, surface, border, input, focus, and legacy-compatibility rules in the global design system.
- Keep the existing theme identifier and saved-setting behaviour unchanged.
- Use existing semantic tokens rather than adding page-specific hardcoded colours.
