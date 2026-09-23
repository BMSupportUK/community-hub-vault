# Guide view page: taller full-width banner

## What changes

On the sports guide view page (`src/routes/_authenticated/_approved/sports-guides.read.$id.tsx`), replace the current fixed-height banner (blurred side-fill with a smaller contained picture) with a taller banner that shows the whole guide picture uncropped, edge to edge.

- Banner container keeps the picture's natural 3:1 shape (`aspect-[3/1]`) at full page width, so the artwork is never stretched or cropped.
- Remove the blurred duplicate image layer — only the sharp picture shows.
- Keep the same rounded corners, border, and position directly under the guide title.
- Nudge surrounding vertical padding down slightly so the event cards still get reasonable space on the locked-height page.

## Notes

- All current guide covers are 1536×512 (3:1), so the banner height scales with page width; nothing is distorted.
- Guides with no header image are unchanged.
- No database or backend changes.
