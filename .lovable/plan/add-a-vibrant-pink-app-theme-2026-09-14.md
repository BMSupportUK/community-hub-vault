# Add a vibrant pink app theme

## What will change
- Add a fifth selectable theme named **Pink Pulse** alongside the existing Purple, Red, Ocean, and Sunset themes.
- Use deep berry backgrounds with vibrant hot-pink, rose, and coral highlights so the theme feels lively without reducing readability.
- Add the new option to the existing admin theme selector with matching colour swatches and confirmation wording.
- Make legacy purple/violet screen styling follow Pink Pulse through the existing theme bridge, preventing mixed or clashing colours.

## Technical details
- Extend the saved theme type and class handling with `pink` / `theme-pink`.
- Define a complete semantic Pink Pulse token set for backgrounds, panels, controls, borders, text, gradients, focus rings, and glow effects.
- Include Pink Pulse in every existing alternate-theme compatibility selector.
- Keep the theme global, persisted through the existing app setting, with no database or permission changes.

## Verification
- Check compilation and current error logs.
- Preview the new selector and activate Pink Pulse.
- Check representative BM Support and Boro Fan Zone screens at desktop and mobile widths for contrast, colour clashes, and readable controls.
