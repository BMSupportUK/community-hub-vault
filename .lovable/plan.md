## Make the side icon rail pop

The rail currently uses a flat `bg-rail` background with subtle `bg-primary/15` icon tiles. It blends into the page and feels dull across all themes.

### Visual upgrades (theme-aware, no hardcoded colors)

**1. Rail background**
- Replace flat `bg-rail` with a vertical gradient using theme tokens: `bg-gradient-to-b from-surface via-rail to-surface-2`
- Add a subtle right-edge glow: inner shadow / `shadow-[inset_-1px_0_0_0_hsl(var(--primary-glow)/0.3)]`
- Add a faint vertical accent stripe behind the active item

**2. BM logo tile (top)**
- Add pulsing glow ring + slight scale-on-hover
- Stronger `shadow-glow` with primary-glow halo

**3. Inactive icon tiles**
- Upgrade from `bg-primary/15` flat to a subtle gradient (`bg-gradient-to-br from-surface-2 to-surface`) with a 1px `ring-1 ring-border/50`
- Icon color uses `text-primary-glow` already — bump contrast with `text-foreground/70` → `text-primary-glow` on hover

**4. Active icon tile**
- Keep gradient + shadow-glow, but add:
  - Animated outer glow (pulsing `ring-2 ring-primary-glow/40`)
  - Brighter left indicator bar (currently `w-1`, bump to `w-1.5` with `shadow-glow`)
  - Subtle scale: `scale-105`

**5. Hover micro-interaction**
- Add `transition-all duration-200`
- Hover: `scale-105` + glow ring fade-in
- Icon: subtle rotate or wiggle on first hover (optional)

**6. Section divider**
- Replace plain `h-px w-8 bg-border` with a gradient divider: `bg-gradient-to-r from-transparent via-primary-glow/40 to-transparent`

### Files to edit
- `src/components/app/IconRail.tsx` — update the `<aside>` background, BM logo tile, `RailIcon` button classes (active/inactive/hover states), and the divider.

No new CSS variables needed — everything uses existing theme tokens (`--primary`, `--primary-glow`, `--surface`, `--surface-2`, `--border`, `--gradient-primary`, `--shadow-glow`) so all 4 themes (Purple, Crimson, Ocean, Sunset) benefit automatically.

### Out of scope
- No changes to icon set, order, badges, or behavior
- No changes to mobile sheet trigger logic
