## Goal
After picking an image in the "Event banner" dialog, show a crop step where the user drags and zooms inside a 300×250 frame, then confirms. Only the confirmed region is uploaded — nothing is auto-trimmed.

## UX
1. User clicks the pencil → opens existing banner dialog.
2. Picks a file via the existing file input.
3. Instead of uploading immediately, a crop view appears inside the same dialog:
   - 300×250 viewport, image draggable, pinch/scroll/slider to zoom.
   - "Cancel" returns to the picker. "Use this crop" confirms.
4. On confirm, the selected region is rendered to a 300×250 JPEG and uploaded to the `event-banners` bucket exactly as today, then `upcoming_event.banner_url` is updated.
5. AI-generated banners are unchanged (already 300×250).

## Implementation
- Add dependency: `react-easy-crop` (small, no peer-deps issues, MIT).
- Edit `src/routes/_authenticated/_approved/home.index.tsx`:
  - New state: `pendingFile: File | null`, `crop`, `zoom`, `croppedAreaPixels`.
  - On file pick: store file in `pendingFile` (don't upload yet).
  - Render `<Cropper>` from `react-easy-crop` with `aspect={300/250}` when `pendingFile` is set, plus a zoom `<Slider>` and Cancel / Use-this-crop buttons.
  - On confirm: use the existing helper to draw the cropped pixel region to a 300×250 canvas → JPEG blob → upload via current `supabase.storage.from('event-banners').upload(...)` flow.
  - Replace the current auto-`cropToCover` call in `uploadBanner` — that helper is no longer needed and can be removed.

## Out of scope
- No rotation control (keeping the dialog simple). Easy to add later if you want.
- No change to how AI-generated banners are produced.
- No schema, RLS or storage policy changes.

## Technical notes
- `react-easy-crop` works in modern browsers and on touch devices (drag + pinch-zoom built in).
- Output rendered client-side via canvas → JPEG 0.9 quality. No server-side image processing (Worker runtime has no `sharp`).
