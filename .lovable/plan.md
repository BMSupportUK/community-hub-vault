# New free nameplates — selectable from the profile picker

## Context
Discord's real nameplate artwork is copyrighted, so we create **original designs in a similar spirit**. All new nameplates are free and selectable by any member via the existing profile nameplate picker — no shop, no payments, no admin assignment needed.

Concept boards reviewed with the user: Neon Glitch, Cyber Rain, Galaxy Swirl, Disco Lights, Boro Scarf, Matchday Pitch, Thunderstorm, Candy Critter.

## What exists today
- `nameplates` table (gradient_css, image_url, animation_class, is_active, sort_order)
- `user_nameplates` grants + `NameplatePicker` — currently users only see nameplates an admin granted them
- `Nameplate` component with animated CSS classes (hotdog, pitch, cinema, devil, corgi, panda, retrotv)

## Plan

### 1. "Free for everyone" support
- Add `is_free boolean not null default false` to `public.nameplates` (with GRANTs/RLS unchanged — nameplates are already readable).
- Update `NameplatePicker` so its list = nameplates where `is_free = true` **plus** any the user owns via `user_nameplates`. Free ones show without needing a grant row.

### 2. Seed 8 new original nameplates (all `is_free = true`)
New `animation_class` entries added to `src/styles.css` and rendered in `Nameplate.tsx`, each with a CSS gradient background + lightweight emoji/particle animation matching the existing nameplate style:
- **Neon Glitch** — purple→cyan gradient, subtle scanline shimmer + glitch flicker
- **Cyber Rain** — dark green-black, falling code-streak dots
- **Galaxy Swirl** — indigo nebula gradient, drifting star sparkles
- **Disco Lights** — dark base with floating colored bokeh dots
- **Boro Scarf** — red/white knit-stripe gradient, gentle wave shimmer
- **Matchday Pitch** — green pitch gradient with faint line markings, rolling ball
- **Thunderstorm** — slate storm gradient, occasional lightning flash
- **Candy Critter** — pastel pink→peach gradient, floating paw prints/sparkles

Seeded via a migration with literal INSERT statements (is_active = true, is_free = true, sensible sort_order).

### 3. Admin
- Add an "Free for everyone" checkbox to the admin nameplate edit dialog so admins can toggle any nameplate free/premium without code changes.

### 4. Verification
- Build check, then Playwright: open profile picker as a test user, confirm the 8 new nameplates appear unlocked, equip one, and confirm it renders behind the username.
