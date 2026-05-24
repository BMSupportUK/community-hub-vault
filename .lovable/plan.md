## Move Staff on Duty strip into the ticket header

In `src/routes/_authenticated/_approved/tickets.tsx`, the hero section currently renders the text block (max-w-3xl on the left) and then `<StaffOnDutyStrip />` below it in a separate full-width row.

The arrow in the screenshot points to the right half of the hero (around the headset area). Move the staff strip there.

### Changes

1. Restructure the hero inner container into a two-column flex layout on `md+`:
   - Left column: existing eyebrow + H1 + paragraph + ratings pill (keeps max-w).
   - Right column: `<StaffOnDutyStrip />` floated to the right, vertically centered, constrained width (e.g. `w-[320px]` / `max-w-sm`), so it overlays the right portion of the hero image.
2. Remove the existing `<div className="relative px-6 md:px-10 pb-6 -mt-8"><StaffOnDutyStrip /></div>` block below the hero text.
3. On mobile (`<md`), stack the strip below the text (existing behavior preserved via flex-col → md:flex-row).
4. The `StaffOnDutyStrip` component itself has an outer `px-4 pt-4` wrapper — wrap the right-column usage so the strip sits flush without extra outer padding (use a small wrapper override or pass through; easiest is to wrap in a div that negates the padding, or simply accept the existing spacing since it's visually fine in the right column).

No logic changes — purely layout.

### Files
- `src/routes/_authenticated/_approved/tickets.tsx` (hero JSX only)
