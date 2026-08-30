# Nameplate pack — original recreations of the styles you sent

## Approach
Discord's actual nameplate artwork can't be copied, and the licensed ones (Star Wars, Spider-Man, Sanrio, Skibidi) can't be reproduced as-is either. Instead each screenshot becomes an original nameplate in the same colour scheme, layout and animation spirit: coloured gradient bar, animated accent on the right, subtle motion across the bar. All free and selectable from the profile nameplate picker.

## The 13 new nameplates

| New nameplate | Inspired by | Look |
|---|---|---|
| Alpine Cross | Switzerland | deep red bar, white cross emblem, soft gloss sweep |
| Sunlit Radiance | Sunlit Radiance | dark red→amber gradient, pulsing sun disc with rays |
| Crimson Static | Fluttering Static | red bar with flickering scanline static + fluttering shape |
| Swamp Sage | Yoda | dark green gradient, hooded-figure silhouette, drifting mist |
| Little Green Crew | The Clawww | navy→teal gradient, floating stars, bobbing green aliens |
| Rolling Droid | BB-8 | gold/sand gradient, small rolling spherical droid |
| Web Rivals | Spider-Man vs Venom | dark red split gradient, two masked-eye shapes, tension pulse |
| Web Lines | Spider-Man (Logo) | maroon bar, animated white web strands from the corner |
| Ice Rider | Mando and Grogu | blue→white gradient, speeder streak with motion blur |
| Dark Helm | Darth Vader | black→crimson gradient, red-lit helm silhouette, glow pulse |
| Desert Pod | Grogu | green→sand gradient, floating pod hovering over dunes |
| Retro Broadcast | TV Woman | purple gradient, small CRT set with rolling scanline |
| Cosmic Cub | Cosmic Guardian | violet nebula gradient, drifting bubbles, cute cub mascot |

(Hot Dog and Ichi-Nyan style plates already exist as `nameplate-hotdog` / candy plates — the Ichi-Nyan vibe is covered by adding **Berry Kitty**: pink bar, floating hearts, strawberry-hat cat. Chococat vibe covered by **Midnight Kitty**: dark blue bar, glowing paw sparkles, black cat with flower.)

Total: 15 new plates.

## Build steps

### 1. Artwork
Generate one transparent PNG mascot/emblem per plate (original art, no Discord/licensed characters), upload via the asset CDN, and reference from the animation CSS. Simple plates (Web Lines, Crimson Static) are pure CSS with no image.

### 2. Free-for-everyone support
- Migration: add `is_free boolean not null default false` to `public.nameplates`.
- `NameplatePicker`: show nameplates where `is_free = true` plus any granted via `user_nameplates`.

### 3. Styles + rendering
- New `@keyframes` + `.nameplate-*` classes in `src/styles.css`, matching the existing pattern (gradient background, `::before` shimmer, absolutely positioned right-side mascot).
- New animation-class branches in `src/components/app/Nameplate.tsx` for each plate's decorative layers.

### 4. Seed
One migration with literal `INSERT` rows (name, description, gradient_css, animation_class, `is_active = true`, `is_free = true`, sort_order).

### 5. Admin
"Free for everyone" checkbox in the admin nameplate edit dialog.

### 6. Verification
Build check, then Playwright: open the profile picker, confirm all new plates appear unlocked and animate, equip one and confirm it renders behind the username.

## Notes
Names and artwork are deliberately original — no Discord asset files, character likenesses or trademarks are used.
