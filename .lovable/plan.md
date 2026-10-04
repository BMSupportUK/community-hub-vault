# Polish every remaining install-guide video

## What will change
- Inventory every published install-guide video except the two Downloader tutorials already completed.
- Polish each video to the same standard: clear British female narration, concise on-screen captions, section labels, and balanced original/background sound.
- Keep narration at the newly corrected normal level, targeting about **-16 LUFS** with safe peak limiting so every guide is consistent and easy to hear.
- Upload each finished video to private guide storage under a new versioned filename, then switch its guide only after the replacement is confirmed valid.
- Retain each previous video as a rollback copy.

## Quality checks
- Confirm duration, picture stream, audio stream, file size, and measured loudness for every finished video.
- Open every affected guide in the preview and confirm its private playback link resolves and playback starts.
- Do not change guide wording, ordering, permissions, or any Talk/ticket code.

## Technical details
- Reuse the established Downloader treatment rather than applying a simple volume boost alone.
- Existing mixed videos can be safely normalized, but adding new narration/captions requires producing a timed edit for each guide from its current recording.
- Use versioned private `guide-videos:` objects and update only the matching `install_blogs.video_url` pointers after validation.
