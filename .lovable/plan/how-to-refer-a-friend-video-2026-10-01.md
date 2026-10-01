# How to Refer a Friend video

## Video
- Record a BM Support walkthrough showing the complete referral journey:
  1. Open Referrals and create a new invite.
  2. Copy and share the secure referral link.
  3. Open the link as the invited friend and complete sign-up.
  4. Show that the friend enters BM Support without the security gate.
  5. Return to the inviter and show the code under Used invites with the joined account’s username.
- Use clearly labelled temporary demo accounts and test data only, with short pauses and on-screen guidance so the video works without sound.
- Remove the temporary invite, accounts, and related test records after recording.

## Referral page
- Add a “How to refer a friend” video panel inside the Welcome tab’s main feature area, matching the established How to Buy presentation.
- Give admin and management an Upload/Replace control for this referral video only.
- Store the MP4 in private app storage and save only its internal reference; members receive a short-lived playback link.
- Disable download, picture-in-picture, remote playback, and the right-click menu where the browser supports those controls.
- Automatically request full-screen as soon as the member presses Play, while retaining normal playback if a device blocks automatic full-screen.
- Keep the panel usable on phones and desktop without changing the other referral tabs.

## Checks
- Verify admin upload and replacement, member playback, signed-link expiry behaviour, and the empty state before a video exists.
- Verify Play opens full-screen on supported desktop and Android browsers, with a safe fallback on iPhone/iPad browser restrictions.
- Verify the complete recorded referral flow and confirm all temporary data is removed.
- Check the Referrals Welcome tab at phone and desktop sizes and confirm the app builds cleanly.

## Technical details
- Reuse the existing authenticated signed-video resolver and private `guide-videos` storage pattern rather than exposing a public media URL.
- Store the referral video reference under its own app setting so it remains separate from How to Buy and How to Renew.
- Extract or reuse the existing secure video panel where practical, keeping upload permissions limited to admin and management.
