# "Video coming soon" illustration on Direct Install app cards

Recording real demo videos is on hold. For now, any app card without a demo video gets a proper illustration with a "Video coming soon" label in place of the plain grey box.

## What changes
- Make one illustration in the BM Support style: a TV screen with a play button and a small "coming soon" clock. It has no app logos, so it fits every app.
- Cards that have no saved video show the illustration with "Video coming soon" on top.
- Cards that already have a video keep playing it, the same as now.
- The same card appears in the Enabler app picker, so those cards change too.

## Later
- When you upload recordings, I add each one as that app's demo video, trimmed but otherwise unedited. Its card then switches from the illustration to the video by itself.

## Technical details
- Generate `src/assets/video-coming-soon.jpg` (16:9) and import it in `AppDemos.tsx`.
- Change the `!demo` branch of `PickVideo` so it shows the image with a semantic-token overlay label.
- Save a memory note: the coming-soon placeholder stays until real recordings are uploaded.
