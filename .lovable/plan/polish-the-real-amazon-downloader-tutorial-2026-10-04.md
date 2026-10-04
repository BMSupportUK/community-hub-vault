# Polish the real Amazon Downloader tutorial

## Goal
Create a review-ready Full HD tutorial using the existing **Install Downloader** recording from **Install Videos | Amazon**, with polished pacing and British female narration. The current guide video will remain unchanged until the new version is approved.

## Production plan
1. Securely retrieve the existing private guide recording and inspect its duration, resolution, frame rate, audio, and exact on-screen sequence.
2. Edit the real footage rather than recreating the Fire TV screens:
   - remove dead time and accidental pauses
   - use restrained zooms and focus highlights around the active Fire TV control
   - add clean section labels and short on-screen captions
   - preserve every required step shown in the source
3. Write and record British female narration timed to the actions actually present in the recording. The narration will clearly cover finding Downloader, installing it, enabling Developer Options and unknown-app access where shown, then opening Downloader and reaching the URL box.
4. Mix narration cleanly over the recording, reducing or removing distracting source audio while retaining useful interface sounds where appropriate.
5. Add readable captions synchronized to the narration and keep all important text within television-safe margins.
6. Render a review MP4 without replacing the current Install Downloader guide video.
7. Verify the finished file from beginning to end, including video/audio integrity, legibility at key frames, complete steps, clean transitions, and correct final duration.

## Technical details
- Output: MP4, H.264, 1920×1080, 30 fps.
- Source: private `Install Downloader` guide recording already stored in the project.
- Editing: frame-based Remotion composition using the source footage, with deterministic zooms, callouts, captions, and timing.
- Narration: British female voice, generated only after the source timing is mapped.
- Delivery: a separate review file in Files; no live guide or stored source is changed during this stage.
