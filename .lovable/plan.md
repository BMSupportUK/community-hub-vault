## Goal
When a user clicks play on an App Demo card, open the video in a large centered lightbox (like YouTube's theatre/recommendation preview) instead of playing inline in the small card.

## Changes (UI only, `src/components/app/AppDemos.tsx`)

1. **Replace inline `<video controls>` on the card** with a poster/thumbnail + large play button overlay. Clicking it sets a `playing: Demo | null` state.
2. **Add a lightbox `Dialog`** rendered when `playing` is set:
   - Wide content: `max-w-5xl w-[95vw]`, no default padding, black background, rounded.
   - Inner `aspect-video` wrapper containing a `<video controls autoPlay playsInline>` using the signed URL.
   - Title + app name shown below the video.
   - Existing dialog close button (X) handles dismissal; closing pauses by unmounting the video.
3. **Signed URL fetch** for the lightbox video reuses the existing `useSignedUrl` hook.
4. No DB, storage, or route changes. No changes to upload flow, categories, or admin controls.

## Out of scope
- No autoplay on hover, no playlist/recommendations sidebar (just the YouTube-style large player size).
- No changes to thumbnails/posters generation.
