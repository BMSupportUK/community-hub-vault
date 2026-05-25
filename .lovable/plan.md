## Plan: Fit landing page into viewport (no scroll)

Make the landing page fill exactly the viewport height so the hero, the three feature boxes, and the footer all fit on screen without scrolling at desktop sizes.

### Changes in `src/routes/index.tsx`

1. **Lock the page to viewport height**
   - Change the root wrapper from `min-h-screen` to `h-screen overflow-hidden` so the page can never exceed the viewport.

2. **Make `<main>` the flexible region**
   - Keep `flex-1` but add `min-h-0 overflow-hidden` and tighten vertical padding (`py-4 md:py-6` instead of `py-10 md:py-16`).

3. **Shrink the hero**
   - Reduce hero padding (`p-4 md:p-6 lg:p-8`, `pb-16 md:pb-20`).
   - Reduce headline size (`text-3xl md:text-5xl`) and trim the gap/spacing between text blocks (`space-y-4`).
   - Cap the hero image height with `max-h-[40vh]` and use `object-cover` so it scales down on short screens instead of pushing content.

4. **Tighten the feature boxes row**
   - Reduce padding (`p-3`), icon size (`size-10`), and text sizes so the row sits comfortably under the hero.
   - Reduce the negative-top overlap to `-mt-3`.

5. **Compact the footer**
   - Reduce footer padding (`py-3`) and the payment-logo sizes slightly so it occupies less vertical space.

### Notes

- This targets desktop (≥1024px). On narrow mobile the content will still need to scroll — true single-screen fit on a 375px phone isn't realistic with this much content. Let me know if you'd rather I:
  - (a) keep mobile scrolling and only enforce no-scroll on desktop (proposed above), or
  - (b) hide/condense more content on mobile to make it fit there too.
