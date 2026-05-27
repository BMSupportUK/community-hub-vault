## Add a full-page background to the Boro Fan Zone forum

Give every `/forum/*` page a full-bleed, fixed background that evokes Middlesbrough FC — red terraces, stadium floodlights, Riverside-style atmosphere — layered behind the existing hero and board cards.

### Trademark note (important)

I can't use the **official Middlesbrough FC crest, kit photography, or copyrighted stadium photos** as a background — that's club IP and would expose you to a takedown. What I *can* do is generate an original, evocative image in Boro's red/white/navy palette (terrace crowd silhouette, floodlit pitch, red-smoke atmosphere) that reads unmistakably as "Boro" without using protected marks. This is the same approach used for the current hero strip and the BFZ badge.

If you have a licensed/official image you'd like to upload instead, say so and I'll wire an upload slot in admin rather than generating one.

### What I'll change (presentation only)

**1. `src/assets/boro-bg.jpg`** (new) — generate a tall, atmospheric portrait-oriented background: floodlit stadium / red terrace crowd silhouette in Boro red, deep navy sky, subtle red smoke. No crest, no players, no kit detail. Tuned dark enough that foreground content stays readable.

**2. `src/routes/_authenticated/_approved/forum.tsx`** — on the `.boro-theme` wrapper:
- Add a `fixed inset-0 -z-10` background layer using `boro-bg.jpg` with `bg-cover bg-center bg-no-repeat bg-fixed`
- Overlay a dark gradient (navy → red-tinted black, ~75% opacity) so cards and text keep contrast
- Add a subtle diagonal red-stripe pattern layer (matches the hero) at very low opacity for texture
- Switch the forum container's surface colours to slightly translucent (`bg-surface-1/85 backdrop-blur-sm`) on board cards and topic rows so the background subtly shows through without hurting legibility

**3. Mobile behaviour** — `bg-fixed` is unreliable on iOS Safari; fall back to `bg-scroll` on small viewports via a media query (the page is already viewed at 411px wide in your preview, so this matters).

### Scope guard

- Background only applies to `/forum`, `/forum/$board`, and `/forum/$board/$topic` (scoped via the existing `.boro-theme` wrapper). It will NOT leak into Home, Members, Admin, etc.
- No changes to data, RLS, auth, or any business logic.
- No changes to the hero banner, badge, or board card structure — just a new layer behind them and a touch of translucency on top.

### Quick question before I build

Two options for the background mood — pick one:
- **A. Terrace crowd silhouette** — sea of red shirts/scarves under stadium lights, very "match-day"
- **B. Empty floodlit Riverside-style pitch** — dramatic, cinematic, calmer behind text

Reply "A" or "B" (or describe your own) and I'll generate + wire it in.
