## Theme the Boro Fan Zone in Middlesbrough FC colours

Replace the generic rose/amber palette across all forum pages with Middlesbrough FC's official red-and-white identity, and inject vibrant match-day imagery so the section feels unmistakably "Boro" the moment a member lands in it.

### Visual direction

- **Primary**: Boro red `#E11B22` (the club's official Pantone 186-equivalent)
- **Secondary**: crisp white, deep navy `#0B1A2B` for surfaces
- **Accent**: amber/gold `#F4B400` for pinned/sticky highlights (badges, pins)
- **Mood**: vibrant, stadium-energy, terrace-banter — bold typographic header, dramatic gradient washes, photographic hero strip

### Files touched (presentation only, no logic / DB changes)

**1. `src/routes/_authenticated/_approved/forum.tsx`** — forum index/layout
- Replace the small `Trophy` chip header with a full-bleed hero banner: red-to-navy gradient, generated stadium/terrace background image at low opacity, bold display heading "BORO FAN ZONE" with "Up the Boro" tagline
- Re-skin board cards: red left-border accent stripe, navy surface, red icon tile (`from-[#E11B22] to-[#8B0F14]`), white-on-red hover glow
- Pinned/locked icons in amber gold

**2. `src/routes/_authenticated/_approved/forum.$board.tsx`** — board (topics list)
- Smaller red-themed sub-hero with breadcrumb back-link
- Topic rows: red sticky badge, red hover ring
- "New topic" CTA in Boro red

**3. `src/routes/_authenticated/_approved/forum.$board.$topic.tsx`** — topic (posts thread)
- Post cards: subtle navy surface, red author-strip on the OP, red reply button
- Quote blockquotes: red left-border instead of amber

**4. `src/styles.css`**
- Add scoped CSS custom properties under a `.boro-theme` wrapper class:
  ```
  --boro-red: #E11B22;
  --boro-red-deep: #8B0F14;
  --boro-navy: #0B1A2B;
  --boro-gold: #F4B400;
  --boro-gradient: linear-gradient(135deg, #E11B22 0%, #8B0F14 60%, #0B1A2B 100%);
  ```
- Apply `.boro-theme` to the forum layout root so the palette only affects fan-zone pages (doesn't leak into the rest of the app).

**5. Generated imagery** (saved to `src/assets/`)
- `boro-hero.jpg` — abstract stadium floodlight / red terrace crowd silhouette (NO club crest, NO player likenesses — avoids trademark issues). Used as the hero background.
- `boro-pattern.svg` — subtle diagonal red stripe pattern for card backgrounds (procedurally written, not generated).

Both produced via `imagegen` with prompts focused on generic football-stadium atmosphere in red/white/navy palette.

### Out of scope

- No changes to forum data model, RLS, or admin tools
- No use of the official Middlesbrough FC crest, badge, or kit photography (trademark)
- No changes to other approved-only pages (home, members, staff, etc.) — theme is scoped to `/forum/*`

### Heads up

Because the club crest is trademarked, the visual identity will be evocative rather than literal — Boro red as the dominant colour, stadium-floodlight imagery, terrace typography. If you want the actual crest used (you'd need rights or an admin-uploaded asset), say so and I'll wire an image upload slot in admin instead of generating one.