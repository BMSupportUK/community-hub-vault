## Goal
When a staff/admin/management user uploads an image for the "Next Big Event" banner on the member home page, automatically re-crop and resize it to exactly 300×250 (matching the advert box) before uploading, so the image always fits perfectly with no stretching, letterboxing, or off-centre framing.

## Where
- `src/routes/_authenticated/_approved/home.index.tsx` — `uploadBanner(file)` currently uploads the raw file. We'll preprocess it client-side first.

## How it will work
1. User picks an image in the banner dialog (any size/aspect).
2. Before upload, draw it to a 300×250 `<canvas>` using a center-crop "cover" fit:
   - Scale the source so the shorter dimension fills 300×250.
   - Centre-crop the overflow on the longer dimension.
3. Export the canvas as a JPEG (quality ~0.9) — smaller than PNG, fine for photos/banners. Transparent uploads (PNG) will get a white background, which is acceptable for a 300×250 ad slot.
4. Upload the resulting blob to the `event-banners` storage bucket exactly as today, then update `upcoming_event.banner_url`.
5. AI-generated banners already come back at the requested size, so no change needed there.

## Technical notes
- Pure client-side, no new dependencies, no schema/RLS changes.
- Use `createImageBitmap(file)` (with an `<img>` + `URL.createObjectURL` fallback) → draw to `OffscreenCanvas` (fallback to a normal `<canvas>`) → `toBlob('image/jpeg', 0.9)`.
- Guard against non-image files (skip resize, surface a toast) and very large files (the canvas draw handles downscaling implicitly).
- Filename becomes `{eventId}/{timestamp}.jpg`; content-type `image/jpeg`.

## Out of scope
- No interactive crop UI (drag to reposition). If you want that later, we can add a react-easy-crop modal — say the word.
- No server-side image processing (Worker runtime doesn't support `sharp`).
