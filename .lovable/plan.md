## Plan: Remove empty space and enlarge boxes to fit one screen

Reclaim the purple void between the feature boxes and the footer by letting `<main>` distribute its space and growing the boxes to fill it.

### Changes in `src/routes/index.tsx`

1. **Distribute vertical space in `<main>`** — add `gap-4` and let the boxes row use `flex-1` so it expands to fill the remaining height instead of leaving a gap.
2. **Make the boxes bigger** — boxes row: `flex-1 items-stretch`. Each card: `p-5`, icon `size-14`, title `text-base`, description `text-sm`, content vertically centered so the taller card looks intentional.
3. **Keep the small `-mt-3` blended overlap** with the hero.
4. **Verify** on the 954×853 viewport via screenshot — confirm no scrollbar and cards fill cleanly.
