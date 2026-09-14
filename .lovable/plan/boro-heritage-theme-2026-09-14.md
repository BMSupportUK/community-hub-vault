# Boro Heritage theme

## Goal
Add a separate selectable theme inspired by Middlesbrough’s current home colours and 150th-anniversary heritage palette.

## Design
- Use rich Boro red as the main action and identity colour.
- Use warm gold for active states, borders, focus rings, and restrained highlights.
- Use deep heritage blue for page backgrounds and panels, keeping the red and gold vivid without overwhelming content.
- Keep text, forms, dialogs, menus, and status colours clear and accessible across BM Support and Boro Fan Zone.
- Add a red, gold, heritage-blue, and soft-white preview swatch to the theme picker.

## Changes
- Add **Boro Heritage** as a new option alongside Vibrant Purple, Crimson & Rose, Electric Ocean, Sunset Blaze, Pink Pulse, and Berry Glass.
- Define a complete semantic theme for backgrounds, surfaces, controls, borders, text, gradients, shadows, and focus states.
- Include the theme in the existing compatibility layer so older purple-styled screens translate consistently.
- Allow it as both a personal profile choice and the admin-selected default.
- Extend the saved profile validation so the choice persists across devices and reloads.

## Technical details
- Add a new stable theme identifier and HTML theme class without changing existing theme identifiers or saved choices.
- Update the global theme tokens and shared picker only; preserve page layouts and functionality.
- Apply a small database validation update to permit the new personal theme value.

## Verification
- Switch to Boro Heritage from both the profile and admin theme controls.
- Confirm persistence after reload and correct fallback to the admin default.
- Check representative BM Support and Boro Fan Zone screens on desktop and mobile for contrast, clipping, and colour clashes.
- Confirm all existing themes remain unchanged and the app builds cleanly.
