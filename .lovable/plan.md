# Splash screen logo

## What changes
- Take the logo image you upload and store it via Lovable Assets (CDN) so it loads fast on cold start.
- Update `src/components/app/BmSplash.tsx` to show your logo centered above the "BM Support" name and loading spinner, replacing the current badge/lettermark.
- Keep the existing splash behaviour unchanged (shows until sign-in and lock state resolve, then fades to the right screen).
- Size the logo responsively (roughly 96–128px tall, capped width) so it looks right on phones and desktop.

## Technical notes
- The uploaded image will be externalized as a CDN asset (`.asset.json` pointer) and imported into the splash component — no binary file left in the repo.
- Transparent-background PNG/SVG logos are ideal; if you upload one with a solid background I'll keep it on a matching panel or remove the background if you prefer.

## What I need from you
- Upload the logo file in chat (PNG with transparency preferred). If you also want a dark-mode/light-mode variant, upload both.
