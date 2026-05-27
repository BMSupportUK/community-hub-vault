## Make the Boro background actually visible

**Problem**
The `fixed inset-0 -z-10` background layers I added are being painted, but the parent layout (`src/routes/_authenticated.tsx`) wraps the whole app in `<div class="min-h-screen flex bg-background">`. That solid `bg-background` (your purple) sits *on top* of my `-z-10` layers, so the stadium image never shows.

**Fix — scope-based body background, no parent layout changes**

1. **`src/routes/_authenticated/_approved/forum.tsx`**
   - Remove the three `fixed inset-0 -z-10` layers (they can't escape the parent's solid background).
   - Add a `useEffect` that, while the forum is mounted, sets the stadium image + gradient overlay on `document.body` via inline style and adds a `boro-bg-active` class to `<html>`. On unmount, restore.
   - Keep the existing hero header, badge, translucent board cards (`bg-surface-1/85 backdrop-blur-sm`) — they already work, they just need a visible background behind them.

2. **`src/styles.css`** — add a small scoped rule:
   ```css
   html.boro-bg-active body > div,
   html.boro-bg-active .min-h-screen.bg-background {
     background-color: transparent !important;
   }
   ```
   This makes the auth wrapper transparent **only** when the forum is mounted, letting the body background show through. Reverts automatically on every other route.

3. **Mobile fallback** — use `background-attachment: scroll` on small viewports (already planned; iOS Safari ignores `fixed`).

**Scope guard**
- Only `/forum/*` is affected (effect lives in the forum route component and cleans up on unmount).
- No changes to data, RLS, auth, hero, badge, board cards, or any other route.
- No edits to the parent `_authenticated.tsx` layout.

**Why this works where the previous attempt didn't**
`-z-10` only goes behind siblings in the same stacking context. The parent's `bg-background` div is a different ancestor — it always wins. Painting on `<body>` puts the image truly underneath the entire app, and the scoped CSS rule punches a hole through the one opaque ancestor that was hiding it.
